import { NextRequest, NextResponse } from 'next/server';
import { User } from '@/server/entities/User';
import { hashPassword } from '@/server/auth/hash';
import { z } from 'zod';
import { getDataSource } from '@/app/lib/db';

export const runtime = 'nodejs';

const schema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  password: z.string().min(6),
  role: z.enum(['user', 'agent']).default('user'),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { email, name, password, role } = parsed.data;

    const ds = await getDataSource();
    const repo = ds.getRepository(User);

    const existing = await repo.findOne({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    }

    const user = repo.create({
      email,
      name,
      role,
      passwordHash: await hashPassword(password),
    });
    const saved = await repo.save(user);

    return NextResponse.json({ id: saved.id, email: saved.email, name: saved.name, role: saved.role }, { status: 201 });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed. Use POST to register a user.' }, { status: 405 });
}