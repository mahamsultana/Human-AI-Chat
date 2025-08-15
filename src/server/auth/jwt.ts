import { SignJWT, jwtVerify } from 'jose';

const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
const alg = 'HS256';

export type JwtPayload = {
  sub: string;
  email: string;
  role: 'user' | 'agent';
  name: string;
};

export async function signJwt(payload: JwtPayload, expiresIn = '7d') {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret);
}

export async function verifyJwt<T = JwtPayload>(token: string) {
  const { payload } = await jwtVerify(token, secret);
  return payload as T;
}
