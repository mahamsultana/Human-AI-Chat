import { NextRequest, NextResponse } from 'next/server';
import { getDataSource } from '@/app/lib/db';
import { Conversation } from '@/server/entities/Conversation';
import { verifyJwt } from '@/server/auth/jwt';

export const runtime = 'nodejs';

async function getUser(req: NextRequest) {
  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) throw new Error('No authorization header');
  return await verifyJwt(auth.split(' ')[1]);
}

export async function GET(req: NextRequest) {
  try {
    const u = await getUser(req);
    if (u.role !== 'agent') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const ds = await getDataSource();
    const repo = ds.getRepository(Conversation);

    const items = await repo.find({
      where: { status: 'pending_human' as const, agentId: null as any },
      order: { updatedAt: 'DESC' },
      relations: ['user'],
    });

    return NextResponse.json({
      conversations: items.map((c) => ({
        id: c.id,
        status: c.status,
        user: c.user ? { id: c.user.id, name: c.user.name, email: c.user.email } : undefined,
        updatedAt: c.updatedAt,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to fetch' }, { status: 500 });
  }
}
