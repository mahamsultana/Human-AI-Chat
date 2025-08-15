import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getDataSource } from '@/app/lib/db';
import { Message } from '@/server/entities/Message';
import { Conversation } from '@/server/entities/Conversation';
import { verifyJwt } from '@/server/auth/jwt';
import { pusherServer } from '@/server/pusher/server';
import { aiStreamAndBroadcast } from '@/server/ai/streamToPusher';

export const runtime = 'nodejs';

const sendMessageSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  senderType: z.enum(['user', 'agent']).default('user'),
});

async function getUser(request: NextRequest) {
  const auth = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) throw new Error('No authorization header');
  return await verifyJwt(auth.split(' ')[1]);
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const conversationId = params.id;
    const user = await getUser(request);

    const body = await request.json();
    const { message, senderType } = sendMessageSchema.parse(body);

    const ds = await getDataSource();
    const msgRepo = ds.getRepository(Message);
    const convoRepo = ds.getRepository(Conversation);

    const convo = await convoRepo.findOne({
      where: { id: conversationId },
      relations: ['user', 'agent'],
    });
    if (!convo) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

    // Access control + normalize sender
    let canSend = false;
    let actualSender: 'user' | 'agent' = senderType;

    if (user.role === 'agent') {
      canSend = convo.agentId === user.sub && convo.status === 'active_human';
      actualSender = 'agent';
    } else {
      canSend = convo.userId === user.sub && convo.status !== 'closed';
      actualSender = 'user';
    }

    if (!canSend) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    const saved = await msgRepo.save(
      msgRepo.create({
        conversationId,
        senderType: actualSender,
        message,
      })
    );

    await convoRepo.update(conversationId, { updatedAt: new Date() });

    const payload = {
      conversationId,
      message: {
        id: saved.id,
        senderType: saved.senderType,
        message: saved.message,
        createdAt: saved.createdAt,
      },
    };

    await pusherServer.trigger(`chat-${conversationId}`, 'message:new', payload);
    if (convo.agentId) {
      await pusherServer.trigger(`agent-${convo.agentId}`, 'message:new', payload);
    }

    // AI replies in bot or pending_human when no agent is assigned
    if (
      actualSender === 'user' &&
      !convo.agentId &&
      (convo.status === 'bot' || convo.status === 'pending_human')
    ) {
      const recent = await msgRepo.find({
        where: { conversationId },
        order: { createdAt: 'ASC' },
        take: 20,
      });
      const history = recent.map((m) => ({
        senderType: m.senderType as 'user' | 'bot' | 'agent',
        message: m.message,
      }));

      aiStreamAndBroadcast({
        conversationId,
        targetUserId: user.sub as string,
        targetAgentId: convo.agentId,
        history,
      }).catch((e) => console.error('AI stream error:', e));
    }

    return NextResponse.json({ success: true, message: payload.message });
  } catch (e: any) {
    const msg = e?.message || 'Failed to send message';
    const code = /authorization|token/i.test(msg) ? 401 : 500;
    return NextResponse.json({ error: msg }, { status: code });
  }
}
