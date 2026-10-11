import { describe, expect, it } from 'vitest'
import { collect, render, type RnTask } from '../src/lib/release-notes'

const day = (d: number) => new Date(2026, 9, d, 12).toISOString()
const t = (id: string, title: string, d: number | null, tags: string[] = [], status = 'done'): RnTask => ({ id, title, tags, project_id: null, status, completed_at: d ? day(d) : null })

describe('release notes', () => {
  const tasks = [t('1', 'Mode hors-ligne', 3), t('2', 'Crash au lancement', 4, ['retour', 'type:bug']), t('3', 'Mode sombre plus doux', 5, ['retour', 'type:idea']),
    t('4', 'Refonte du CI', 6, ['interne']), t('5', 'Trop ancien', 1), t('6', 'Pas terminé', 7, [], 'todo')]
  it('groups, filters by date and hides internal work', () => {
    const s = collect(tasks, new Date(2026, 9, 2), new Date(2026, 9, 10))
    expect(s.map((x) => [x.key, x.items.map((i) => i.id)])).toEqual([['features', ['1']], ['improvements', ['3']], ['fixes', ['2']]])
  })
  it('renders markdown in the chosen language and honours exclusions', () => {
    const s = collect(tasks, new Date(2026, 9, 2), new Date(2026, 9, 10))
    expect(render(s, 'fr', '2.0.3')).toBe('# Notes de version 2.0.3\n\n## Nouveautés\n- Mode hors-ligne\n\n## Améliorations\n- Mode sombre plus doux\n\n## Corrections\n- Crash au lancement')
    expect(render(s, 'en', '', new Set(['1', '3', '2']))).toBe('# Release notes\n\nNo task finished in this period.')
  })
})
