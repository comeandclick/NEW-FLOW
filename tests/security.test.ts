import { describe, expect, it } from 'vitest'
import { safePath } from '../src/lib/utils'
import { rateLimited, sameOrigin } from '../src/lib/security'
import { cleanChannel, routesFrom } from '../src/lib/api/alert-types'
import { hashKey, generateKey, sameHash } from '../src/lib/api/keys'

describe('safePath', () => {
  it('keeps same-site paths', () => { expect(safePath('/app/x?y=1')).toBe('/app/x?y=1') })
  it.each(['javascript:alert(1)', '//evil.com', '/\\evil.com', 'https://evil.com', '', null, 42, '/a\nb'])('rejects %s', (v) => { expect(safePath(v)).toBe('/app') })
})

describe('sameOrigin', () => {
  const req = (origin: string | null, host = 'flow.app') => new Request('https://flow.app/api/keys', { method: 'POST', headers: { ...(origin ? { origin } : {}), host } })
  it('accepts same origin and missing origin', () => { expect(sameOrigin(req('https://flow.app'))).toBe(true); expect(sameOrigin(req(null))).toBe(true) })
  it('rejects other origins', () => { expect(sameOrigin(req('https://evil.com'))).toBe(false); expect(sameOrigin(req('null'))).toBe(false) })
})

describe('rateLimited', () => {
  it('blocks after max', () => { const k = 'k' + Math.random(); for (let i = 0; i < 3; i++) expect(rateLimited(k, 3)).toBe(false); expect(rateLimited(k, 3)).toBe(true) })
})

describe('api keys', () => {
  it('generates unique prefixed keys whose hash verifies', () => {
    const a = generateKey(), b = generateKey()
    expect(a.key).toMatch(/^flw_[\w-]{43}$/); expect(a.key).not.toBe(b.key)
    expect(sameHash(hashKey(a.key), a.hash)).toBe(true); expect(sameHash(hashKey(b.key), a.hash)).toBe(false)
  })
})

describe('alert routes', () => {
  it('cleans channel names', () => { expect(cleanChannel('#Sécurité !!')).toBe('sécurité'); expect(cleanChannel('   ')).toBe('general') })
  it('merges saved routes over defaults', () => {
    const r = routesFrom({ api_alerts: { routes: { 'task.done': { enabled: false, channel: 'Fait', notify: true } } } })
    expect(r['task.done']).toEqual({ enabled: false, channel: 'fait', notify: true }); expect(r.request.channel).toBe('demandes')
  })
})
