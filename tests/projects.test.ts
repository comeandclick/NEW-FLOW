import { describe, expect, it } from 'vitest'
import { projectPath, projectTree, withDescendants } from '@/lib/projects'

const P = [
  { id: 'k', name: 'Kalimat', parent_id: null }, { id: 'k2', name: 'Kalimat 2.0', parent_id: 'k' }, { id: 'k1', name: 'Kalimat 1.0', parent_id: 'k' },
  { id: 'pub', name: 'Publication', parent_id: 'k' }, { id: 'tt', name: 'TikTok', parent_id: 'pub' },
  { id: 'l', name: 'Lumora', parent_id: null }, { id: 'm', name: 'Motion design', parent_id: null }, { id: 'perdu', name: 'Orphelin', parent_id: 'supprimé' },
]

describe('projets dans des projets', () => {
  it('chemin lisible', () => {
    expect(projectPath('tt', P)).toBe('Kalimat › Publication › TikTok')
    expect(projectPath('l', P)).toBe('Lumora')
    expect(projectPath('perdu', P)).toBe('Orphelin')
    expect(projectPath(null, P)).toBe('')
  })
  it('arbre : parents puis enfants, par nom, avec la profondeur', () => {
    expect(projectTree(P).map(({ project, depth }) => `${depth}:${project.name}`)).toEqual([
      '0:Kalimat', '1:Kalimat 1.0', '1:Kalimat 2.0', '1:Publication', '2:TikTok', '0:Lumora', '0:Motion design', '0:Orphelin'])
  })
  it('un projet et ses sous-projets', () => {
    expect(withDescendants('k', P).sort()).toEqual(['k', 'k1', 'k2', 'pub', 'tt'].sort())
    expect(withDescendants('pub', P).sort()).toEqual(['pub', 'tt'])
    expect(withDescendants('l', P)).toEqual(['l'])
  })
  it('une boucle (A dans B dans A) ne bloque rien', () => {
    const boucle = [{ id: 'a', name: 'A', parent_id: 'b' }, { id: 'b', name: 'B', parent_id: 'a' }]
    expect(projectTree(boucle).length).toBe(2)
    expect(projectPath('a', boucle).length).toBeGreaterThan(0)
  })
})
