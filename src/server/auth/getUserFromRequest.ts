import { NextRequest } from 'next/server';
import { verifyJwt } from './jwt';

export type AuthUser = {
  id: string;
  email: string;
  role: 'user' | 'agent';
  name: string;
} | null;

export async function getUserFromRequest(req: NextRequest): Promise<AuthUser> {
  const auth = req.headers.get('authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice('Bearer '.length) : null;
  if (!token) return null;
  try {
    const payload = await verifyJwt(token);
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      name: payload.name,
    };
  } catch {
    return null;
  }
}
