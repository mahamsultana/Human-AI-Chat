import bcrypt from 'bcrypt';

export async function hashPassword(p: string) {
  return await bcrypt.hash(p, 10);
}

export async function verifyPassword(p: string, hash: string) {
  return await bcrypt.compare(p, hash);
}
