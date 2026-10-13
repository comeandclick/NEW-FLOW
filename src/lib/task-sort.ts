/** Ordre des tâches dans chaque état (liste et tableau) : demande d'Aymen du 14/10/2026. Fonction pure, testée. */
type T = { status: string; priority: string; due_date: string | null; completed_at?: string | null; created_at: string; updated_at?: string }

const RANG: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }
const jour = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/**
 * À faire : par jour (en retard, aujourd'hui, demain, après-demain… ; sans date à la fin), puis importance (urgente en haut),
 * puis heure prévue. Terminées / annulées : la plus récemment terminée en haut.
 */
export function sortTasks<X extends T>(list: X[], now = new Date()): X[] {
  const today = jour(now)
  const cle = (x: X) => {
    if (!x.due_date) return Number.POSITIVE_INFINITY
    const d = Math.round((jour(new Date(x.due_date)) - today) / 864e5)
    return d < 0 ? -1 : d   // tout ce qui est en retard ensemble, avant aujourd'hui
  }
  return [...list].sort((a, b) => {
    const fini = (x: X) => x.status === 'done' || x.status === 'cancelled'
    if (fini(a) || fini(b)) {
      if (fini(a) !== fini(b)) return fini(a) ? 1 : -1
      const t = (x: X) => new Date(x.completed_at ?? x.updated_at ?? x.created_at).getTime()
      return t(b) - t(a)
    }
    const j = cle(a) - cle(b); if (j !== 0 && !Number.isNaN(j)) return j
    const p = (RANG[a.priority] ?? 9) - (RANG[b.priority] ?? 9); if (p !== 0) return p
    if (a.due_date && b.due_date) { const h = new Date(a.due_date).getTime() - new Date(b.due_date).getTime(); if (h !== 0) return h }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
}
