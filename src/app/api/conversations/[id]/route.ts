import { NextRequest, NextResponse } from 'next/server';
import { getDataSource } from '@/app/lib/db';
import { Conversation } from '@/server/entities/Conversation';
import { Message } from '@/server/entities/Message';
import { verifyJwt } from '@/server/auth/jwt';

export const runtime = 'nodejs';

async function getUser(req: NextRequest) {
  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) throw new Error('No authorization header');
  return await verifyJwt(auth.split(' ')[1]);
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const u = await getUser(req);
    const conversationId = params.id;

    const ds = await getDataSource();
    const convoRepo = ds.getRepository(Conversation);
    const msgRepo = ds.getRepository(Message);

    const convo = await convoRepo.findOne({
      where: { id: conversationId },
      relations: ['user', 'agent'],
    });
    if (!convo) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

    const canSee =
      (u.role === 'user' && convo.userId === u.sub) ||
      (u.role === 'agent' && (convo.agentId === u.sub || (convo.status === 'pending_human' && !convo.agentId)));

    if (!canSee) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    const messages = await msgRepo.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
    });

    return NextResponse.json({
      conversation: {
        id: convo.id,
        status: convo.status,
        userId: convo.userId,
        agentId: convo.agentId,
        createdAt: convo.createdAt,
        updatedAt: convo.updatedAt,
        user: convo.user ? { id: convo.user.id, name: convo.user.name, email: convo.user.email } : undefined,
        agent: convo.agent ? { id: convo.agent.id, name: convo.agent.name, email: convo.agent.email } : null,
      },
      messages: messages.map((m) => ({
        id: m.id,
        senderType: m.senderType,
        message: m.message,
        createdAt: m.createdAt,
      })),
    });
  } catch (e: any) {
    const msg = e?.message || 'Failed to fetch conversation';
    const code = /authorization|token/i.test(msg) ? 401 : 500;
    return NextResponse.json({ error: msg }, { status: code });
  }
}
