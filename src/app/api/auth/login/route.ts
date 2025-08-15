// src/app/api/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getDataSource } from '@/app/lib/db';
import { User } from '@/server/entities/User';
import { verifyPassword } from '@/server/auth/hash';
import { signJwt } from '@/server/auth/jwt';
import { z } from 'zod';

export const runtime = 'nodejs';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export async function POST(req: NextRequest) {
  const { email, password } = schema.parse(await req.json());
  const ds = await getDataSource();
  const repo = ds.getRepository(User);

  const user = await repo.findOne({ where: { email } });
  if (!user) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

  const token = await signJwt({
    sub: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
  });

  return NextResponse.json({ token, user: { id: user.id, email: user.email, role: user.role, name: user.name } });
}
