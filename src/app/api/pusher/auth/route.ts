import { NextRequest, NextResponse } from 'next/server';
import { pusherServer } from '@/server/pusher/server';
import { verifyJwt } from '@/server/auth/jwt';

export const runtime = 'nodejs';

async function getUser(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth) throw new Error('No authorization header');
  const token = auth.split(' ')[1];
  if (!token) throw new Error('No token provided');
  return await verifyJwt(token);
}

export async function POST(req: NextRequest) {
  try {
    // Pusher sends form-encoded data
    const form = await req.formData();
    const socketId = String(form.get('socket_id') || '');
    const channel = String(form.get('channel_name') || '');

    const user = await getUser(req);

    // Authorization rules
    if (channel.startsWith('private-user-')) {
      const userId = channel.replace('private-user-', '');
      if (user.sub !== userId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      const auth = pusherServer.authorizeChannel(socketId, channel);
      return NextResponse.json(auth);
    }

    if (channel.startsWith('private-agent-')) {
      const agentId = channel.replace('private-agent-', '');
      if (user.role !== 'agent' || user.sub !== agentId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      const auth = pusherServer.authorizeChannel(socketId, channel);
      return NextResponse.json(auth);
    }

    if (channel === 'presence-agents') {
      if (user.role !== 'agent') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      const presenceData = {
        user_id: user.sub,
        user_info: { name: user.name || 'Agent', email: user.email },
      };
      const auth = pusherServer.authorizeChannel(socketId, channel, presenceData);
      return NextResponse.json(auth);
    }

    return NextResponse.json({ error: 'Unknown channel' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Auth failed' }, { status: 401 });
  }
}
