import { NextRequest, NextResponse } from 'next/server';
import { getDataSource } from '@/app/lib/db';
import { Conversation } from '@/server/entities/Conversation';
import { verifyJwt } from '@/server/auth/jwt';
import { pusherServer } from '@/server/pusher/server';

export const runtime = 'nodejs';

async function getUser(req: NextRequest) {
  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) throw new Error('No authorization header');
  return await verifyJwt(auth.split(' ')[1]);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const u = await getUser(req);

    const ds = await getDataSource();
    const repo = ds.getRepository(Conversation);

    const convo = await repo.findOne({ where: { id: params.id } });
    if (!convo) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

    const canRelease =
      (u.role === 'user' && convo.userId === u.sub) ||
      (u.role === 'agent' && convo.agentId === u.sub);

    if (!canRelease) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (convo.status !== 'active_human' || !convo.agentId) {
      return NextResponse.json({ error: 'Conversation is not in active human mode' }, { status: 400 });
    }

    const prevAgent = convo.agentId;
    await repo.update(convo.id, { agentId: null, status: 'bot', updatedAt: new Date() });

    // Notify user chat to switch to bot mode
    await pusherServer.trigger(`chat-${convo.id}`, 'conversation:bot_mode', {
      conversationId: convo.id,
    });

    // Notify agent console that they were released
    await pusherServer.trigger(`agent-${prevAgent}`, 'conversation:released', {
      conversationId: convo.id,
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to return to bot mode' }, { status: 500 });
  }
}
