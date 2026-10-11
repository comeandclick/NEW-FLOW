import { describe, expect, it } from 'vitest'
import { buildDigest } from '../src/lib/digest'

describe('daily update', () => {
  const now = new Date(2026, 9, 9, 10)
  const t = (title: string, status: string, due: Date | null, done: Date | null = null, who = 'me') => ({ title, status, assignee_id: who, due_date: due?.toISOString() ?? null, completed_at: done?.toISOString() ?? null })
  it('lists done, planned and late work for the person only', () => {
    const txt = buildDigest([
      t('Terminée hier', 'done', null, new Date(2026, 9, 8, 15)), t('Terminée il y a une semaine', 'done', null, new Date(2026, 9, 1)),
      t('En cours', 'in_progress', null), t('Pour aujourd’hui', 'todo', new Date(2026, 9, 9, 18)), t('En retard', 'todo', new Date(2026, 9, 5)), t('Pas à moi', 'in_progress', null, null, 'other'),
    ], 'me', 'Aymen', 'fr', now)
    expect(txt).toContain('Point du jour — Aymen'); expect(txt).toContain('- Terminée hier'); expect(txt).not.toContain('semaine'); expect(txt).not.toContain('Pas à moi')
    expect(txt).toMatch(/Au programme :\n- En cours\n- Pour aujourd’hui/); expect(txt).toMatch(/En retard :\n- En retard/)
  })
  it('says nothing when there is nothing, and omits the late block', () => {
    expect(buildDigest([], 'me', 'A', 'en', now)).toBe('Daily update — A\n\nFinished since yesterday:\n- nothing\n\nToday:\n- nothing')
  })
})
