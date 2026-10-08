'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDb } from '@/lib/supabase/client'

export type RingPayload = { meetingId: string; room: string; from: string; fromName: string; video: boolean; to: string[]; title: string; slug: string }

/** Broadcast a ring to the workspace channel. Listeners filter on `to`. */
export function ring(wsId: string, payload: RingPayload) {
  const db = getDb()
  const ch = db.channel(`ring:${wsId}`)
  ch.subscribe((status: string) => {
    if (status === 'SUBSCRIBED') {
      void ch.send({ type: 'broadcast', event: 'ring', payload })
      setTimeout(() => void db.removeChannel(ch), 1500)
    }
  })
}

export async function startCall(opts: {
  wsId: string; slug: string; userId: string; userName: string; title: string; video: boolean; to: string[]; conversationId?: string
}) {
  const { data, error } = await getDb().from('meetings').insert({
    workspace_id: opts.wsId, title: opts.title, host_id: opts.userId, status: 'live', started_at: new Date().toISOString(),
  }).select().single()
  if (error || !data) return null
  const m = data as any
  if (opts.conversationId) {
    await getDb().from('messages').insert({
      conversation_id: opts.conversationId, user_id: opts.userId, kind: 'call', content: opts.video ? 'video' : 'audio',
      attachments: [{ type: 'file', name: m.room, path: m.id }],
    })
  }
  ring(opts.wsId, { meetingId: m.id, room: m.room, from: opts.userId, fromName: opts.userName, video: opts.video, to: opts.to, title: opts.title, slug: opts.slug })
  for (const u of opts.to) {
    void getDb().from('notifications').insert({
      user_id: u, workspace_id: opts.wsId, type: 'call', title: opts.userName, body: opts.video ? '📹 …' : '📞 …', url: `/app/${opts.slug}/meetings/${m.id}?audio=${opts.video ? 0 : 1}`,
    })
  }
  return m as { id: string; room: string }
}
