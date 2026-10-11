import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { KEY_PREFIX } from './scopes'

export const hashKey = (key: string) => createHash('sha256').update(key).digest('hex')

/** 256 bits of entropy: a plain SHA-256 is enough, there is nothing to brute-force. */
export function generateKey() {
  const secret = randomBytes(32).toString('base64url')
  const key = `${KEY_PREFIX}${secret}`
  return { key, prefix: key.slice(0, KEY_PREFIX.length + 6), hash: hashKey(key) }
}

export function sameHash(a: string, b: string) {
  const x = Buffer.from(a, 'hex'), y = Buffer.from(b, 'hex')
  return x.length === y.length && timingSafeEqual(x, y)
}
