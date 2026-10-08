'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getDb } from '@/lib/supabase/client'

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
export function useLive<T = any>(table: string, opts: Opts<T> = {}) {
  const { select = '*', eq, is, in: inn, order, limit, enabled = true, live = true, channelFilter, transform } = opts
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const key = useMemo(() => JSON.stringify({ table, select, eq, is, inn, order, limit, enabled }), [table, select, eq, is, order, limit, enabled])
  const transformRef = useRef(transform)
  transformRef.current = transform

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
    if (err) { setError(err.message); setLoading(false); return }
    setError(null)
    setData(transformRef.current ? transformRef.current(rows ?? []) : ((rows ?? []) as T[]))
    setLoading(false)
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setLoading(true); void fetchNow() }, [fetchNow])

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
