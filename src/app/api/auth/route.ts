// src/app/api/pusher/auth/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { pusherServer, presenceAgents } from '@/server/pusher/server';
import { getUserFromRequest } from '@/server/auth/getUserFromRequest';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { channel_name, socket_id } = await req.json();

  // Only agents may join presence-agents
  if (channel_name === presenceAgents && user.role !== 'agent') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Presence: attach user_id & user_info
  if (channel_name === presenceAgents) {
    const auth = pusherServer.authenticate(socket_id, channel_name, {
      user_id: user.id,
      user_info: { name: user.name, email: user.email },
    });
    return NextResponse.json(auth);
  }

  // Private: normal auth
  const auth = pusherServer.authorizeChannel(socket_id, channel_name);
  return NextResponse.json(auth);
}
