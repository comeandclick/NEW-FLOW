'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from 'react'
import { getDb } from '@/lib/supabase/client'

/** Total unread messages (from others) across the user's conversations in a workspace. */
export function useUnread(workspaceId: string, userId: string | null) {
  const [count, setCount] = useState(0)
  const [byConv, setByConv] = useState<Record<string, number>>({})

  const compute = useCallback(async () => {
    if (!userId) return
    const db = getDb()
    const { data: convs } = await db.from('conversations').select('id').eq('workspace_id', workspaceId)
    const ids = (convs ?? []).map((c: any) => c.id)
    if (!ids.length) { setCount(0); setByConv({}); return }
    const { data: mine } = await db.from('conversation_members').select('conversation_id,last_read_at,muted').eq('user_id', userId).in('conversation_id', ids)
    const reads = new Map<string, string>((mine ?? []).map((m: any) => [m.conversation_id, m.last_read_at]))
    const joined = [...reads.keys()]
    if (!joined.length) { setCount(0); setByConv({}); return }
    const oldest = [...reads.values()].sort()[0]
    const { data: msgs } = await db.from('messages').select('conversation_id,user_id,created_at').in('conversation_id', joined).gt('created_at', oldest).is('deleted_at', null).limit(500)
    const per: Record<string, number> = {}
    for (const m of msgs ?? []) {
      if ((m as any).user_id === userId) continue
      if ((m as any).created_at > (reads.get((m as any).conversation_id) ?? '')) per[(m as any).conversation_id] = (per[(m as any).conversation_id] ?? 0) + 1
    }
    setByConv(per)
    setCount(Object.values(per).reduce((a, b) => a + b, 0))
  }, [workspaceId, userId])

  useEffect(() => {
    void compute()
    const db = getDb()
    const ch = db.channel(`unread:${workspaceId}:${Math.random().toString(36).slice(2, 6)}`)
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'messages' }, () => void compute())
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'conversation_members' }, () => void compute())
      .subscribe()
    return () => { void db.removeChannel(ch) }
  }, [compute, workspaceId])

  return { count, byConv, refresh: compute }
}
