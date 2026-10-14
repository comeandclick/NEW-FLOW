'use client'
 
import { useCallback, useEffect, useRef, useState } from 'react'
import { getDb } from '@/lib/supabase/client'
import { isDemoBrowser } from '@/lib/demo/runtime'
import { readCache, writeCache } from '@/lib/offline'

type Opts<T> = {
  select?: string
  eq?: Record<string, string | number | boolean | null | undefined>
  is?: Record<string, null | boolean>
  in?: Record<string, string[]>
  order?: [string, boolean?] | [string, boolean?][]
  limit?: number
  enabled?: boolean
  /** Subscribe to realtime changes (default true). */
  live?: boolean
  /** Supabase realtime filter, e.g. "workspace_id=eq.<id>". Derived from eq.workspace_id when absent. */
  channelFilter?: string
  transform?: (rows: any[]) => T[]
}

/**
 * Fetch a table and keep it fresh through realtime events.
 * `data` can be patched optimistically via `setData`; a refetch reconciles with the server.
 */
let hydrate = false
const cleDe = (table: string, o: Opts<any>) => JSON.stringify({ table, select: o.select ?? '*', eq: o.eq, is: o.is, inn: o.in, order: o.order, limit: o.limit, enabled: o.enabled ?? true })

export function useLive<T = any>(table: string, opts: Opts<T> = {}) {
  const { select = '*', eq, is, in: inn, order, limit, enabled = true, live = true, channelFilter, transform } = opts
  // après le premier affichage (hydratation), une page qui s'ouvre montre tout de suite les données déjà connues
  const [data, setData] = useState<T[]>(() => { const c = hydrate && enabled && !isDemoBrowser() ? readCache<any[]>(cleDe(table, opts)) : null; return c ? (transform ? transform(c) : (c as T[])) : [] })
  const [loading, setLoading] = useState(() => enabled && !(hydrate && !isDemoBrowser() && readCache(cleDe(table, opts))))
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Computed on every render on purpose: `in` lists (e.g. message ids) must change the key when their content changes.
  const key = cleDe(table, opts)
  const transformRef = useRef(transform)
  useEffect(() => { transformRef.current = transform })

  const fetchNow = useCallback(async () => {
    if (!enabled) { setData([]); setLoading(false); return }
    const id = ++seq.current
    let q: any = getDb().from(table).select(select)
    if (eq) for (const [k, v] of Object.entries(eq)) if (v !== undefined) q = v === null ? q.is(k, null) : q.eq(k, v)
    if (is) for (const [k, v] of Object.entries(is)) q = q.is(k, v)
    if (inn) for (const [k, v] of Object.entries(inn)) q = q.in(k, v)
    if (order) {
      const list = (Array.isArray(order[0]) ? order : [order]) as [string, boolean?][]
      for (const [col, asc] of list) q = q.order(col, { ascending: asc !== false })
    }
    if (limit) q = q.limit(limit)
    const { data: rows, error: err } = await q
    if (id !== seq.current) return
    if (err) { setError(err.message); setLoading(false); return } // keeps whatever the cache already showed
    setError(null)
    if (!isDemoBrowser()) writeCache(key, rows ?? [])
    setData(transformRef.current ? transformRef.current(rows ?? []) : ((rows ?? []) as T[]))
    setLoading(false)
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    hydrate = true
    // Paint the last known rows immediately (also what an offline reload shows), then refresh from the server.
    const cached = enabled && !isDemoBrowser() ? readCache<any[]>(key) : null
    if (cached) { setData(transformRef.current ? transformRef.current(cached) : (cached as T[])); setLoading(false) } else setLoading(true)
    void fetchNow()
  }, [fetchNow]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!enabled || !live) return
    const filter = channelFilter ?? (eq?.workspace_id ? `workspace_id=eq.${eq.workspace_id}` : undefined)
    const db = getDb()
    const schedule = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void fetchNow(), 120)
    }
    const ch = db
      .channel(`live:${key}:${Math.random().toString(36).slice(2, 7)}`)
      .on('postgres_changes' as any, { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) }, schedule)
      .subscribe()
    return () => {
      if (timer.current) clearTimeout(timer.current)
      void db.removeChannel(ch)
    }
  }, [key, live, enabled]) // eslint-disable-line react-hooks/exhaustive-deps

  return { data, setData, loading, error, refresh: fetchNow }
}
