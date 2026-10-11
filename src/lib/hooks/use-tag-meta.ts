'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getDb } from '@/lib/supabase/client'
import { isDemoBrowser } from '@/lib/demo/runtime'
import { readTagMeta, type TagMeta } from '@/lib/note-tags'

/** Colours and notified people of note tags (workspace-wide). Saving goes through /api/tags so any writer can do it. */
export function useTagMeta(wsId: string) {
  const [meta, setMeta] = useState<TagMeta>({})
  const [loaded, setLoaded] = useState(false)
  const latest = useRef<TagMeta>({})
  const queue = useRef<Promise<boolean>>(Promise.resolve(true))

  const load = useCallback(async () => {
    const { data } = await getDb().from('workspaces').select('settings').eq('id', wsId).maybeSingle()
    if (data) { const m = readTagMeta((data as { settings?: unknown }).settings); latest.current = m; setMeta(m) }
    setLoaded(true)
  }, [wsId])
  useEffect(() => { void load() }, [load])

  /** Saves are sent one after the other, each carrying the newest state, so quick successive edits can never overwrite each other. */
  const save = useCallback((next: TagMeta) => {
    latest.current = next
    setMeta(next)
    const job = async () => {
      const body = latest.current
      if (isDemoBrowser()) {
        const { data } = await getDb().from('workspaces').select('settings').eq('id', wsId).single()
        const { error } = await getDb().from('workspaces').update({ settings: { ...((data as { settings?: object } | null)?.settings ?? {}), note_tags: body } }).eq('id', wsId)
        return !error
      }
      const r = await fetch('/api/tags', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspaceId: wsId, meta: body }) }).catch(() => null)
      if (!r?.ok) { void load(); return false }
      return true
    }
    queue.current = queue.current.then(job, job)
    return queue.current
  }, [wsId, load])

  return { meta, loaded, save, reload: load }
}
