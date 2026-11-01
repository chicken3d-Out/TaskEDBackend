import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

// Refresh tokens are stored encrypted (AES-256-GCM). The key comes from
// TOKEN_ENCRYPTION_KEY, or is derived from JWT_SECRET when that is not set.
function key(): Buffer {
  const secret = process.env.TOKEN_ENCRYPTION_KEY || process.env.JWT_SECRET || 'change_this_to_a_long_random_string';
  return createHash('sha256').update(secret).digest();
}

export function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}

export function decryptToken(stored: string): string | null {
  try {
    const [iv, tag, enc] = stored.split('.').map((p) => Buffer.from(p, 'base64'));
    const decipher = createDecipheriv('aes-256-gcm', key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch {
    return null; // key changed or data damaged: the person has to reconnect
  }
}
