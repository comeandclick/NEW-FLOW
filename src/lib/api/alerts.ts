import { getAdminDb } from '@/lib/supabase/server'
import { notifyUsers } from './notify'
import type { StoredKey } from './scopes'

import { ALERT_TYPES, DEFAULT_ROUTES, cleanChannel, routesFrom, type AlertType, type Severity } from './alert-types'
export { ALERT_TYPES, cleanChannel, routesFrom } from './alert-types'
export type { AlertType, Severity } from './alert-types'

const LABEL: Record<AlertType, string> = {
  'task.done': 'Tâche terminée', 'group.done': 'Groupe de tâches terminé', 'step.done': 'Étape terminée',
  'security.alert': 'Alerte de sécurité', request: 'Demande', error: 'Erreur', info: 'Info',
}
const DEFAULT_SEVERITY: Record<AlertType, Severity> = { 'task.done': 'success', 'group.done': 'success', 'step.done': 'success', 'security.alert': 'critical', request: 'warning', error: 'warning', info: 'info' }
const SEV_LABEL: Record<Severity, string> = { info: '', success: '', warning: ' · attention', critical: ' · critique' }

type Admin = ReturnType<typeof getAdminDb>
type Ws = { id: string; slug: string; settings?: unknown }
type Who = Pick<StoredKey, 'name' | 'bot_id' | 'created_by'>
export type AlertInput = { type: AlertType; title: string; body?: string; severity?: Severity; channel?: string; link?: string }

async function ensureChannel(a: Admin, ws: Ws, who: Who, name: string) {
  const { data: found } = await a.from('conversations').select('id,name').eq('workspace_id', ws.id).in('type', ['channel', 'group']).ilike('name', name.replace(/[%_]/g, '')).limit(1)
  if (found?.[0]) return found[0] as { id: string; name: string }
  const { data: c, error } = await a.from('conversations').insert({ workspace_id: ws.id, type: 'channel', name, description: 'Alertes et suivi envoyés par l’API', created_by: who.bot_id }).select('id,name').single()
  if (error || !c) throw new Error('channel')
  await a.from('conversation_members').insert([{ conversation_id: c.id, user_id: who.bot_id, role: 'owner' }, { conversation_id: c.id, user_id: who.created_by, role: 'member' }])
  return c as { id: string; name: string }
}

/** Posts the alert in its channel as the key's bot and (depending on the route) notifies the right people. */
export async function emitAlert(a: Admin, ws: Ws, who: Who, input: AlertInput) {
  const route = routesFrom(ws.settings)[input.type]
  if (!route.enabled) return { skipped: true as const }
  const severity = input.severity ?? DEFAULT_SEVERITY[input.type]
  const channel = input.channel ? cleanChannel(input.channel) : route.channel
  const conv = await ensureChannel(a, ws, who, channel)
  const text = `${LABEL[input.type]}${SEV_LABEL[severity]} — ${input.title}${input.body ? `\n${input.body}` : ''}${input.link ? `\n${input.link}` : ''}`.slice(0, 8000)
  const { data: msg } = await a.from('messages').insert({ conversation_id: conv.id, user_id: who.bot_id, kind: 'text', content: text }).select('id').single()

  if (route.notify || severity === 'critical') {
    let ids = [who.created_by]
    if (input.type === 'security.alert' || severity === 'critical') {
      const { data: ms } = await a.from('workspace_members').select('user_id').eq('workspace_id', ws.id).in('role', ['owner', 'admin'])
      ids = Array.from(new Set([...(ms ?? []).map((m) => m.user_id as string), who.created_by]))
    }
    await notifyUsers(ws.id, ids, { type: 'alert', title: `${LABEL[input.type]}${SEV_LABEL[severity]}`, body: input.title, url: `/app/${ws.slug}/messages/${conv.id}` })
  }
  return { skipped: false as const, channel: conv.name, message_id: msg?.id as string | undefined }
}
