import { describe, expect, it } from 'vitest'
import { captureLabel, cleanCaptureUrl, currentProjectOf, embedUrl, firstUrl, inferCaptureKind, instagramPost, isThumbHost, projectLabels, projectsOf, resolveProjects, wantsAi, withCurrentProject, youtubeId } from '@/lib/captures'
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

describe('captures: « Analyse par l’IA »', () => {
  it('is on only when clearly asked (form, share shortcut, API)', () => {
    for (const yes of [true, 'true', '1', 'on', 'oui', 'Oui', ' yes ']) expect(wantsAi(yes)).toBe(true)
  })
  it('is off by default and for anything unclear', () => {
    for (const no of [undefined, null, false, '', 'false', '0', 'non', 'no', 1, {}, 'peut-être']) expect(wantsAi(no)).toBe(false)
  })
})

describe('captures: lecteurs officiels', () => {
  it('YouTube : liens longs, courts, Shorts', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://m.youtube.com/shorts/abcDEF12345')).toBe('abcDEF12345')
    expect(embedUrl('youtube', 'https://youtu.be/dQw4w9WgXcQ')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?playsinline=1&autoplay=1&rel=0')
  })
  it('Instagram : Reel, publication, lien avec nom de compte', () => {
    expect(instagramPost('https://www.instagram.com/reel/Cxyz123ab/?igsh=abc')).toEqual({ type: 'reel', code: 'Cxyz123ab' })
    expect(instagramPost('https://www.instagram.com/reels/Cxyz123ab/')).toEqual({ type: 'reel', code: 'Cxyz123ab' })
    expect(instagramPost('https://instagram.com/p/Babc12345/')).toEqual({ type: 'p', code: 'Babc12345' })
    expect(embedUrl('instagram', 'https://www.instagram.com/reel/Cxyz123ab/')).toBe('https://www.instagram.com/reel/Cxyz123ab/embed/')
  })
  it('TikTok : numéro dans le lien, ou fourni par l’oEmbed pour un lien court', () => {
    expect(embedUrl('tiktok', 'https://www.tiktok.com/@studio/video/7300000000000000001')).toBe('https://www.tiktok.com/embed/v2/7300000000000000001')
    expect(embedUrl('tiktok', 'https://vm.tiktok.com/ZNabc123/')).toBeNull()
    expect(embedUrl('tiktok', 'https://vm.tiktok.com/ZNabc123/', '7300000000000000002')).toBe('https://www.tiktok.com/embed/v2/7300000000000000002')
  })
  it('relais de miniatures : seulement les hébergeurs connus, en https', () => {
    expect(isThumbHost('https://p16-sign-va.tiktokcdn.com/obj/x.jpeg')).toBe(true)
    expect(isThumbHost('https://i.ytimg.com/vi/x/hqdefault.jpg')).toBe(true)
    expect(isThumbHost('http://i.ytimg.com/vi/x.jpg')).toBe(false)
    expect(isThumbHost('https://evil.com/?h=ytimg.com')).toBe(false)
    expect(isThumbHost('https://ytimg.com.evil.com/x.jpg')).toBe(false)
  })
  it('projets d’une capture', () => {
    expect(projectsOf({ project_id: 'a', project_ids: ['a', 'b'] })).toEqual(['a', 'b'])
    expect(projectsOf({ project_id: 'a', project_ids: [] })).toEqual(['a'])
    expect(projectsOf({ project_id: null })).toEqual([])
  })
})

describe('captures: projets choisis dans le raccourci', () => {
  const tree = [
    { id: 'k', name: 'Kalimat', path: 'Kalimat' }, { id: 'k2', name: 'Kalimat 2.0', path: 'Kalimat › Kalimat 2.0' },
    { id: 'l', name: 'Lumora', path: 'Lumora' }, { id: 'v1', name: 'Vidéos', path: 'Kalimat › Vidéos' }, { id: 'v2', name: 'Vidéos', path: 'Motion › Vidéos' },
  ]
  it('libellés : projet en cours en tête', () => {
    expect(projectLabels(tree.slice(0, 2), { id: 'k2', path: 'Kalimat › Kalimat 2.0' })).toEqual(['Projet en cours (Kalimat › Kalimat 2.0)', 'Kalimat', 'Kalimat › Kalimat 2.0'])
  })
  it('plusieurs projets, une ligne chacun, sans doublon', () => {
    expect(resolveProjects('Kalimat › Kalimat 2.0\nLumora\nLumora', tree, null)).toEqual(['k2', 'l'])
    expect(resolveProjects(['Projet en cours (Kalimat › Kalimat 2.0)', 'Lumora'], tree, 'k2')).toEqual(['k2', 'l'])
  })
  it('nom seul accepté seulement sans ambiguïté', () => {
    expect(resolveProjects('lumora', tree, null)).toEqual(['l'])
    expect(resolveProjects('Vidéos', tree, null)).toEqual([])
    expect(resolveProjects('Motion › Vidéos', tree, null)).toEqual(['v2'])
  })
  it('rien de reconnu : liste vide (la capture ira dans le projet en cours)', () => {
    expect(resolveProjects('Inconnu', tree, 'k')).toEqual([])
    expect(resolveProjects(undefined, tree, 'k')).toEqual([])
  })
})
