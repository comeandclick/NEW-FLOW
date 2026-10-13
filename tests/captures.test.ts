import { describe, expect, it } from 'vitest'
import { captureLabel, cleanCaptureUrl, currentProjectOf, firstUrl, inferCaptureKind, withCurrentProject } from '@/lib/captures'
import { ALL_SCOPES, PRESETS, validScopes } from '@/lib/api/scopes'

describe('captures: kind', () => {
  it('recognises the networks from the link, whatever the subdomain', () => {
    expect(inferCaptureKind({ url: 'https://vm.tiktok.com/ZNabc123/' })).toBe('tiktok')
    expect(inferCaptureKind({ url: 'https://www.tiktok.com/@user/video/7300000000000000000' })).toBe('tiktok')
    expect(inferCaptureKind({ url: 'https://www.instagram.com/reel/Cxyz/' })).toBe('instagram')
    expect(inferCaptureKind({ url: 'https://youtu.be/dQw4w9WgXcQ' })).toBe('youtube')
    expect(inferCaptureKind({ url: 'https://m.youtube.com/watch?v=dQw4w9WgXcQ' })).toBe('youtube')
  })
  it('does not mistake a look-alike domain for a network', () => {
    expect(inferCaptureKind({ url: 'https://nottiktok.com/x' })).toBe('lien')
    expect(inferCaptureKind({ url: 'https://tiktok.com.example.org/x' })).toBe('lien')
  })
  it('falls back to the file, then to text', () => {
    expect(inferCaptureKind({ mime: 'image/png' })).toBe('image')
    expect(inferCaptureKind({ mime: 'video/mp4' })).toBe('video')
    expect(inferCaptureKind({ mime: 'application/pdf' })).toBe('texte')
    expect(inferCaptureKind({})).toBe('texte')
  })
  it('a link wins over an attached file', () => {
    expect(inferCaptureKind({ url: 'https://example.com/a', mime: 'image/png' })).toBe('lien')
  })
})

describe('captures: links', () => {
  it('accepts http and https only', () => {
    expect(cleanCaptureUrl(' https://example.com/a?b=1 ')).toBe('https://example.com/a?b=1')
    expect(cleanCaptureUrl('http://example.com')).toBe('http://example.com/')
    expect(cleanCaptureUrl('javascript:alert(1)')).toBeNull()
    expect(cleanCaptureUrl('data:text/html,<script>')).toBeNull()
    expect(cleanCaptureUrl('file:///etc/passwd')).toBeNull()
    expect(cleanCaptureUrl('pas un lien')).toBeNull()
    expect(cleanCaptureUrl('')).toBeNull()
    expect(cleanCaptureUrl(42)).toBeNull()
    expect(cleanCaptureUrl(`https://example.com/${'a'.repeat(2100)}`)).toBeNull()
  })
  it('finds the link inside a shared sentence', () => {
    expect(firstUrl('Regarde ça https://vm.tiktok.com/ZNabc/ !')).toBe('https://vm.tiktok.com/ZNabc/')
    expect(firstUrl('(https://example.com/page).')).toBe('https://example.com/page')
    expect(firstUrl('aucun lien ici')).toBeNull()
    expect(firstUrl(null)).toBeNull()
  })
})

describe('captures: label', () => {
  it('uses the title, else the site, else the start of the note', () => {
    expect(captureLabel({ title: ' Idée de transition ', url: 'https://x.com', kind: 'lien' })).toBe('Idée de transition')
    expect(captureLabel({ url: 'https://www.instagram.com/reel/abc', kind: 'instagram' })).toBe('instagram.com')
    expect(captureLabel({ note: 'a'.repeat(200), kind: 'texte' })).toHaveLength(81)
    expect(captureLabel({ kind: 'image' })).toBe('image')
  })
})

describe('captures: current project', () => {
  it('is stored per workspace and leaves the other preferences alone', () => {
    const prefs = withCurrentProject({ ui: { accent: 'blue' } }, 'ws-1', 'p-1')
    expect(prefs.ui).toEqual({ accent: 'blue' })
    expect(currentProjectOf(prefs, 'ws-1')).toBe('p-1')
    expect(currentProjectOf(prefs, 'ws-2')).toBeNull()
    const both = withCurrentProject(prefs, 'ws-2', 'p-9')
    expect(currentProjectOf(both, 'ws-1')).toBe('p-1')
    expect(currentProjectOf(withCurrentProject(both, 'ws-1', null), 'ws-1')).toBeNull()
  })
  it('survives missing or broken preferences', () => {
    expect(currentProjectOf(null, 'ws')).toBeNull()
    expect(currentProjectOf({ current_project: 'oops' }, 'ws')).toBeNull()
    expect(currentProjectOf({ current_project: { ws: 12 } }, 'ws')).toBeNull()
    expect(currentProjectOf(withCurrentProject(undefined, 'ws', 'p'), 'ws')).toBe('p')
  })
})

describe('captures: API scope', () => {
  it('exists, and a key can hold it alone', () => {
    expect(ALL_SCOPES).toContain('captures:read')
    expect(ALL_SCOPES).toContain('captures:write')
    expect(validScopes(['captures:write'])).toEqual(['captures:write'])
    expect(PRESETS.read).toContain('captures:read')
    expect(PRESETS.read).not.toContain('captures:write')
  })
})
