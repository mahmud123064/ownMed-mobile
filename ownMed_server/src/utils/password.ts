import bcrypt from "bcryptjs";

// 12 rounds is the current sweet spot: strong enough, still fast enough for an
// interactive login (a few hundred ms even in pure-JS bcryptjs).
const ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
