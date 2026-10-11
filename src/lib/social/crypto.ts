/** AES-256-GCM encryption for OAuth tokens stored in DB. Requires SOCIAL_ENCRYPT_KEY env var (32-byte hex). */

function key(): Promise<CryptoKey> {
  const raw = process.env.SOCIAL_ENCRYPT_KEY
  if (!raw) throw new Error('SOCIAL_ENCRYPT_KEY missing')
  const bytes = Buffer.from(raw, 'hex')
  if (bytes.length !== 32) throw new Error('SOCIAL_ENCRYPT_KEY must be 32-byte hex (64 chars)')
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function encryptToken(plaintext: string): Promise<string> {
  const k = await key()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(plaintext))
  const combined = new Uint8Array(iv.length + enc.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(enc), iv.length)
  return Buffer.from(combined).toString('base64')
}

export async function decryptToken(ciphertext: string): Promise<string> {
  const k = await key()
  const combined = Buffer.from(ciphertext, 'base64')
  const iv = combined.subarray(0, 12)
  const data = combined.subarray(12)
  const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, k, data)
  return new TextDecoder().decode(dec)
}
