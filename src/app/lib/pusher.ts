import Pusher from 'pusher-js';

export function createPusherClient() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
  return new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
    cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    channelAuthorization: {
      endpoint: '/api/pusher/auth',
      transport: 'ajax',
      headers: { Authorization: token ? `Bearer ${token}` : '' },
    },
  });
}
