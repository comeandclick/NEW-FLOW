'use client'
 
import { getDb } from '@/lib/supabase/client'

export type Trigger = 'task_created' | 'task_done' | 'member_joined'

/** Runs every active automation bound to `trigger` for the workspace (client-side engine). */
export async function fireAutomations(wsId: string, slug: string, trigger: Trigger, actorId: string, subject: string) {
  const db = getDb()
  const { data: autos } = await db.from('automations').select('*').eq('workspace_id', wsId).eq('trigger_type', trigger).eq('is_active', true)
  if (!autos?.length) return
  const { data: members } = await db.from('workspace_members').select('user_id').eq('workspace_id', wsId)
  for (const a of autos as any[]) {
    const msg = `${a.action_config?.message ?? ''} ${subject}`.trim()
    try {
      if (a.action_type === 'notify') {
        const rows = ((members ?? []) as any[]).filter((m) => m.user_id !== actorId).map((m) => ({ user_id: m.user_id, workspace_id: wsId, type: 'automation', title: a.name, body: msg, url: `/app/${slug}/tasks` }))
        if (rows.length) await db.from('notifications').insert(rows)
      } else if (a.action_type === 'send_message') {
        const { data: ch } = await db.from('conversations').select('id').eq('workspace_id', wsId).eq('type', 'channel').eq('name', 'general').maybeSingle()
        if (ch) await db.from('messages').insert({ conversation_id: (ch as any).id, user_id: actorId, kind: 'text', content: msg })
      }
      await db.from('automations').update({ run_count: (a.run_count ?? 0) + 1, last_run_at: new Date().toISOString() }).eq('id', a.id)
    } catch { /* an automation must never break the user action */ }
  }
}
