import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDataSource } from '@/app/lib/db';
import { Conversation } from '@/server/entities/Conversation';
import { Message } from '@/server/entities/Message';
import { verifyJwt } from '@/server/auth/jwt';
import { aiStreamAndBroadcast } from '@/server/ai/streamToPusher';

export const runtime = 'nodejs';

const createSchema = z.object({ message: z.string().min(1) });

async function getUser(req: NextRequest) {
  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) throw new Error('No authorization header');
  return await verifyJwt(auth.split(' ')[1]);
}

export async function GET(req: NextRequest) {
  try {
    const u = await getUser(req);
    const ds = await getDataSource();
    const convoRepo = ds.getRepository(Conversation);

    let convos: Conversation[] = [];
    if (u.role === 'agent') {
      // Assigned to me OR pending and unassigned
      convos = await convoRepo.find({
        where: [
          { agentId: u.sub as string },
          { status: 'pending_human' as const, agentId: null as any },
        ],
        order: { updatedAt: 'DESC' },
        relations: ['user', 'agent'],
      });
    } else {
      convos = await convoRepo.find({
        where: { userId: u.sub as string },
        order: { updatedAt: 'DESC' },
        relations: ['agent'],
      });
    }

    return NextResponse.json({
      conversations: convos.map((c) => ({
        id: c.id,
        userId: c.userId,
        agentId: c.agentId,
        status: c.status,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        user: c.user ? { id: c.user.id, name: c.user.name, email: c.user.email } : undefined,
        agent: c.agent ? { id: c.agent.id, name: c.agent.name, email: c.agent.email } : null,
      })),
    });
  } catch (e: any) {
    const msg = e?.message || 'Failed to fetch conversations';
    const code = /authorization|token/i.test(msg) ? 401 : 500;
    return NextResponse.json({ error: msg }, { status: code });
  }
}

export async function POST(req: NextRequest) {
  try {
    const u = await getUser(req);
    const body = await req.json();
    const { message } = createSchema.parse(body);

    const ds = await getDataSource();
    const convoRepo = ds.getRepository(Conversation);
    const msgRepo = ds.getRepository(Message);

    // Create new conversation in bot mode
    const convo = await convoRepo.save(
      convoRepo.create({
        userId: u.sub as string,
        status: 'bot',
      })
    );

    // First user message
    const first = await msgRepo.save(
      msgRepo.create({
        conversationId: convo.id,
        senderType: 'user',
        message,
      })
    );

    // Kick off AI reply for the very first message (fire-and-forget)
    (async () => {
      try {
        const recent = await msgRepo.find({
          where: { conversationId: convo.id },
          order: { createdAt: 'ASC' },
          take: 20,
        });

        const history = recent.map((m) => ({
          senderType: m.senderType as 'user' | 'bot' | 'agent',
          message: m.message,
        }));

        await aiStreamAndBroadcast({
          conversationId: convo.id,
          targetUserId: u.sub as string,
          targetAgentId: null,
          history,
        });
      } catch (e) {
        console.error('AI streaming error (create):', e);
      }
    })();

    return NextResponse.json({
      conversation: { id: convo.id, status: convo.status, createdAt: convo.createdAt },
      message: { id: first.id, senderType: first.senderType, message: first.message, createdAt: first.createdAt },
    });
  } catch (e: any) {
    const msg = e?.message || 'Failed to create conversation';
    const code = /authorization|token/i.test(msg) ? 401 : 500;
    return NextResponse.json({ error: msg }, { status: code });
  }
}
