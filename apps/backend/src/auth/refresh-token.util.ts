import { randomBytes, createHash } from 'crypto';

// Refresh tokens are opaque high-entropy random strings, not JWTs — they
// carry no claims, they're just an unguessable lookup key. Only the SHA-256
// hash is ever persisted (fast hash is correct here, unlike passwords:
// there's nothing to brute-force against 256 bits of randomness).
export function generateRefreshToken(): string {
  return randomBytes(64).toString('hex');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
