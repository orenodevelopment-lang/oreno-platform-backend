import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { loadConfig } from '../../config/index.js';

/**
 * Symmetric encryption for stored secrets at rest.
 *
 * Used for the TOTP shared secret, which must be recoverable to verify a code
 * (unlike a password, which is only ever compared). AES-256-GCM is used so the
 * ciphertext is authenticated: a tampered row fails to decrypt rather than
 * silently yielding a wrong secret.
 *
 * The key is derived from `SESSION_SECRET` with a purpose label, so rotating
 * the session secret invalidates stored second-factor secrets rather than
 * leaving them readable under an unchanged key.
 */
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_PURPOSE = 'oreno:field-encryption:v1';

function key(): Buffer {
  return createHash('sha256').update(`${KEY_PURPOSE}:${loadConfig().session.secret}`).digest();
}

/** Returns `base64url(iv).base64url(tag).base64url(ciphertext)`. */
export function encryptField(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString('base64url')).join('.');
}

export function decryptField(payload: string): string {
  const [ivPart, tagPart, ciphertextPart] = payload.split('.');
  if (!ivPart || !tagPart || !ciphertextPart) {
    throw new Error('Encrypted field is malformed.');
  }
  const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

/** True when a value looks like output from `encryptField`. */
export function isEncryptedField(value: string): boolean {
  return value.split('.').length === 3;
}
