import { describe, expect, it } from 'vitest'
import { sortTasks } from '@/lib/task-sort'

const now = new Date('2026-10-14T10:00:00')
const t = (title: string, priority: string, due: string | null, status = 'todo', completed_at: string | null = null) =>
  ({ title, priority, due_date: due, status, completed_at, created_at: '2026-10-13T20:00:00Z' })

describe('tri des tâches', () => {
  it('jour d’abord (retard, aujourd’hui, demain…), puis importance, puis heure ; sans date à la fin', () => {
    const r = sortTasks([
      t('demain basse', 'low', '2026-10-15T09:00:00'), t('sans date urgente', 'urgent', null),
      t('aujourd’hui moyenne 16h', 'medium', '2026-10-14T16:00:00'), t('aujourd’hui urgente 18h', 'urgent', '2026-10-14T18:00:00'),
      t('en retard', 'low', '2026-10-10T09:00:00'), t('après-demain haute', 'high', '2026-10-16T09:00:00'),
      t('aujourd’hui moyenne 14h', 'medium', '2026-10-14T14:00:00'),
    ], now).map((x) => x.title)
    expect(r).toEqual(['en retard', 'aujourd’hui urgente 18h', 'aujourd’hui moyenne 14h', 'aujourd’hui moyenne 16h', 'demain basse', 'après-demain haute', 'sans date urgente'])
  })
  it('terminées : la plus récente en haut', () => {
    const r = sortTasks([t('vieille', 'urgent', null, 'done', '2026-10-13T10:00:00Z'), t('récente', 'low', null, 'done', '2026-10-13T22:00:00Z')], now).map((x) => x.title)
    expect(r).toEqual(['récente', 'vieille'])
  })
})
