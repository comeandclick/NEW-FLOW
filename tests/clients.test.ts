import { describe, expect, it } from 'vitest'
import { clientFilePath, groupFiles, isDemoToken, isValidToken, newClientToken, nextVersion, titleFromName, type ClientFile } from '@/lib/clients'

const file = (id: string, title: string, version: number, created_at: string, extra: Partial<ClientFile> = {}): ClientFile => ({
  id, workspace_id: 'w', client_id: 'c', title, name: `${id}.mp4`, mime_type: 'video/mp4', size: 1, storage_path: `w/c/${id}.mp4`, version,
  status: 'livree', uploaded_by_kind: 'team', uploaded_by: null, created_at, updated_at: created_at, deleted_at: null, ...extra,
})

describe('clients: lien secret', () => {
  it('crée des jetons longs, différents et valides', () => {
    const a = newClientToken(), b = newClientToken()
    expect(a).not.toBe(b)
    expect(a.length).toBeGreaterThanOrEqual(40)
    expect(isValidToken(a)).toBe(true)
  })
  it('refuse les jetons trop courts ou avec des caractères inattendus', () => {
    expect(isValidToken('court')).toBe(false)
    expect(isValidToken('a'.repeat(30) + '/..')).toBe(false)
    expect(isValidToken("x' or 1=1 --aaaaaaaaaaaaaaa")).toBe(false)
  })
  it('reconnaît le jeton de la démo', () => {
    expect(isDemoToken('demo')).toBe(true)
    expect(isDemoToken('demo-abc')).toBe(true)
    expect(isDemoToken(newClientToken())).toBe(false)
  })
})

describe('clients: fichiers et versions', () => {
  it('range un fichier dans le dossier du client, nom nettoyé', () => {
    const p = clientFilePath('ws1', 'cl1', 'Ma vidéo (finale)/../x.mp4')
    expect(p.startsWith('ws1/cl1/')).toBe(true)
    expect(p).not.toContain('..')
    expect(p.split('/')).toHaveLength(3)
  })
  it('propose un titre à partir du nom de fichier', () => {
    expect(titleFromName('cours_2-ceci-cela.mp4')).toBe('cours 2 ceci cela')
    expect(titleFromName('.mp4')).toBe('Fichier')
  })
  it('même titre (sans tenir compte des majuscules) = version suivante', () => {
    const files = [file('a', 'Cours 1', 1, '2026-10-01'), file('b', 'cours 1', 2, '2026-10-03'), file('c', 'Cours 2', 1, '2026-10-05')]
    expect(nextVersion(files, 'COURS 1')).toBe(3)
    expect(nextVersion(files, 'Cours 3')).toBe(1)
    expect(nextVersion([...files, file('d', 'Cours 2', 2, '2026-10-06', { deleted_at: '2026-10-07' })], 'Cours 2')).toBe(2)
  })
  it('groupe par titre, dernière version en premier, groupe le plus récent en tête', () => {
    const g = groupFiles([file('a', 'Cours 1', 1, '2026-10-01', { status: 'modif' }), file('b', 'Cours 1', 2, '2026-10-03', { status: 'validee' }), file('c', 'Cours 2', 1, '2026-10-05')])
    expect(g.map((x) => x.title)).toEqual(['Cours 2', 'Cours 1'])
    expect(g[1].versions.map((v) => v.version)).toEqual([2, 1])
    expect(g[1].versions[0].status).toBe('validee')
  })
})
