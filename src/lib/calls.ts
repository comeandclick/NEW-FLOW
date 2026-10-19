'use client'
 
import { getDb } from '@/lib/supabase/client'

export type RingPayload = { meetingId: string; room: string; from: string; fromName: string; video: boolean; to: string[]; title: string; slug: string }

// supabase-js returns the SAME channel object for a given topic, so the sender must reuse the
// channel the CallListener already subscribed to (creating/removing a second one would break it).
let shared: { wsId: string; ch: any } | null = null
export function registerRingChannel(wsId: string, ch: any) { shared = ch ? { wsId, ch } : null }

/**
 * Événement sur le canal de sonnerie de l'espace (le même que l'app) :
 * `ring` (appel, filtré sur `to`), `end` (l'appelant a raccroché avant réponse), `decline` (l'appelé refuse).
 */
export function ringEvent(wsId: string, event: 'ring' | 'end' | 'decline', payload: Record<string, unknown>) {
  if (shared?.wsId === wsId) { void shared.ch.send({ type: 'broadcast', event, payload }); return }
  const db = getDb()
  const ch = db.channel(`ring:${wsId}`)
  ch.subscribe((status: string) => {
    if (status === 'SUBSCRIBED') {
      void ch.send({ type: 'broadcast', event, payload })
      setTimeout(() => void db.removeChannel(ch), 1500)
    }
  })
}

/** Broadcast a ring to the workspace channel. Listeners filter on `to`. */
export function ring(wsId: string, payload: RingPayload) { ringEvent(wsId, 'ring', payload) }

export async function startCall(opts: {
  wsId: string; slug: string; userId: string; userName: string; title: string; video: boolean; to: string[]; conversationId?: string
}) {
  const { data, error } = await getDb().from('meetings').insert({
    workspace_id: opts.wsId, title: opts.title, host_id: opts.userId, status: 'live', started_at: new Date().toISOString(),
  }).select().single()
  if (error || !data) return null
  const m = data as any
  // La sonnerie part d'abord ; le message « appel » de la conversation suit sans faire attendre.
  ring(opts.wsId, { meetingId: m.id, room: m.room, from: opts.userId, fromName: opts.userName, video: opts.video, to: opts.to, title: opts.title, slug: opts.slug })
  if (opts.conversationId) {
    void getDb().from('messages').insert({
      conversation_id: opts.conversationId, user_id: opts.userId, kind: 'call', content: opts.video ? 'video' : 'audio',
      attachments: [{ type: 'file', name: m.room, path: m.id }],
    }).then(() => {}, () => {})
  }
  for (const u of opts.to) {
    const url = `/app/${opts.slug}/meetings/${m.id}?audio=${opts.video ? 0 : 1}`
    void getDb().from('notifications').insert({
      user_id: u, workspace_id: opts.wsId, type: 'call', title: opts.userName, body: opts.video ? '📹 …' : '📞 …', url,
    })
    // Téléphone et navigateurs fermés : sonnerie CallKit sur iPhone (VoIP), notification ailleurs.
    void fetch('/api/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: u, workspaceId: opts.wsId, type: 'call', title: opts.userName, body: opts.video ? 'Appel vidéo' : 'Appel audio', url }) }).catch(() => {})
  }
  return m as { id: string; room: string }
}
