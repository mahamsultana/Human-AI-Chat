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
    if (u.role !== 'agent') return NextResponse.json({ error: 'Only agents can accept' }, { status: 403 });

    const ds = await getDataSource();
    const qb = ds
      .createQueryBuilder()
      .update(Conversation)
      .set({ agentId: u.sub as string, status: 'active_human', updatedAt: new Date() })
      .where('id = :id', { id: params.id })
      .andWhere(`status = :status`, { status: 'pending_human' })
      .andWhere('agentId IS NULL');

    const res = await qb.execute();
    if (!res.affected) {
      return NextResponse.json({ error: 'Already taken or not in pending state' }, { status: 409 });
    }

    await pusherServer.trigger(`chat-${params.id}`, 'agent:assigned', {
      conversationId: params.id,
      agent: { id: u.sub, name: (u as any).name, email: u.email },
    });

    return NextResponse.json({ success: true, conversationId: params.id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to accept' }, { status: 500 });
  }
}
