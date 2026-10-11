'use client'
import { useEffect, useState } from 'react'
import { studioApi, type LiveJob } from './api'

export const STUDIO_USED_KEY = 'flow_studio_used'
export type StudioActivity = { motion: { active: number; ask: number }; site: { active: number; ask: number } }
const EMPTY: StudioActivity = { motion: { active: 0, ask: 0 }, site: { active: 0, ask: 0 } }

/** Compteurs pour la barre latérale : projets en cours et questions en attente. N'interroge le serveur que si le Studio a déjà été utilisé. */
export function useStudioActivity(): StudioActivity {
  const [a, setA] = useState<StudioActivity>(EMPTY)
  useEffect(() => {
    let used = false
    try { used = localStorage.getItem(STUDIO_USED_KEY) === '1' } catch {}
    if (!used) return
    let alive = true
    const load = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const { jobs } = await studioApi.jobs()
        if (!alive) return
        const sum = (kind: LiveJob['kind']) => ({
          active: jobs.filter((j) => j.kind === kind && ['starting', 'running', 'paused', 'needs_answer', 'queued'].includes(j.status)).length,
          ask: jobs.filter((j) => j.kind === kind && j.status === 'needs_answer').length,
        })
        setA({ motion: sum('motion'), site: sum('site') })
      } catch { /* hors ligne ou mode démonstration */ }
    }
    void load()
    const id = setInterval(load, 10_000)
    return () => { alive = false; clearInterval(id) }
  }, [])
  return a
}
