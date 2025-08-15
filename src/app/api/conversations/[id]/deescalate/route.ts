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
    if (u.role !== 'user') return NextResponse.json({ error: 'Only users can de-escalate' }, { status: 403 });

    const ds = await getDataSource();
    const repo = ds.getRepository(Conversation);
    const convo = await repo.findOne({ where: { id: params.id } });
    if (!convo) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    if (convo.userId !== u.sub) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    if (!(convo.status === 'pending_human' && !convo.agentId)) {
      return NextResponse.json({ error: 'Cannot de-escalate now' }, { status: 400 });
    }

    await repo.update(convo.id, { status: 'bot', updatedAt: new Date() });

    // Notify the chat panel to switch its badge
    await pusherServer.trigger(`chat-${convo.id}`, 'conversation:bot_mode', {
      conversationId: convo.id,
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to de-escalate' }, { status: 500 });
  }
}
