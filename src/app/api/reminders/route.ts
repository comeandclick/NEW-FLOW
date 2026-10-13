import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/supabase/server'
import { notifyUsers } from '@/lib/api/notify'
import { agentsTime, momentOf, parisClock, reminderTitle } from '@/lib/reminders'

export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * POST /api/reminders (appelé chaque minute par pg_cron de Supabase, en-tête x-reminders-secret) :
 * - 5 min avant et à l'heure d'un événement (participants) ou d'une tâche à heure fixe (personne assignée), seulement pour les humains ;
 * - chaque jour vers 9 h 30 (Paris) : « Lancer la session de travail des agents » au propriétaire de l'espace.
 * Chaque rappel n'est envoyé qu'une fois (table reminders_sent).
 */
export async function POST(req: Request) {
  const secret = process.env.REMINDERS_SECRET
  if (!secret || req.headers.get('x-reminders-secret') !== secret) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const a = getAdminDb()
  const now = Date.now()
  const from = new Date(now - 2 * 60e3).toISOString(), to = new Date(now + 6 * 60e3).toISOString()

  const [{ data: events }, { data: tasks }, { data: spaces }] = await Promise.all([
    a.from('events').select('id,workspace_id,title,start_at,attendees,task_id').is('deleted_at', null).eq('all_day', false).gte('start_at', from).lte('start_at', to),
    a.from('tasks').select('id,workspace_id,title,due_date,assignee_id').is('deleted_at', null).not('status', 'in', '(done,cancelled)').not('assignee_id', 'is', null).gte('due_date', from).lte('due_date', to),
    a.from('workspaces').select('id,slug,owner_id'),
  ])
  const slug = (id: string) => spaces?.find((w) => w.id === id)?.slug ?? ''
  // humains seulement : ni robots des clés API, ni agents Claude
  const people = [...new Set([...(events ?? []).flatMap((e) => (e.attendees as string[]) ?? []), ...(tasks ?? []).map((t) => t.assignee_id as string)])]
  const { data: profs } = people.length ? await a.from('profiles').select('id,preferences').in('id', people) : { data: [] }
  const human = (id: string) => { const p = (profs ?? []).find((x) => x.id === id)?.preferences as { bot?: boolean; agent?: string } | null; return !!(profs ?? []).find((x) => x.id === id) && !p?.bot && !p?.agent }

  const items: { key: string; ws: string; user: string; type: string; title: string; url: string }[] = []
  for (const e of events ?? []) {
    const m = momentOf(new Date(e.start_at).getTime(), now); if (!m) continue
    for (const u of ((e.attendees as string[]) ?? []).filter(human)) items.push({ key: `${m}:event:${e.id}:${u}`, ws: e.workspace_id, user: u, type: 'event', title: reminderTitle(m, e.title), url: e.task_id ? `/app/${slug(e.workspace_id)}/tasks?open=${e.task_id}` : `/app/${slug(e.workspace_id)}/calendar` })
  }
  const withEvent = new Set((events ?? []).map((e) => e.task_id).filter(Boolean))
  for (const t of tasks ?? []) {
    if (withEvent.has(t.id) || !human(t.assignee_id as string)) continue   // déjà rappelée par son événement
    const m = momentOf(new Date(t.due_date as string).getTime(), now); if (!m) continue
    items.push({ key: `${m}:task:${t.id}:${t.assignee_id}`, ws: t.workspace_id, user: t.assignee_id as string, type: 'task', title: reminderTitle(m, t.title), url: `/app/${slug(t.workspace_id)}/tasks?open=${t.id}` })
  }
  const clock = parisClock(new Date(now))
  if (agentsTime(clock.hm)) for (const w of spaces ?? []) items.push({ key: `agents:${clock.day}:${w.id}`, ws: w.id, user: w.owner_id, type: 'alert', title: 'Lancer la session de travail des agents', url: `/app/${w.slug}/team` })

  let sent = 0
  for (const it of items) {
    // une seule fois par rappel : la clé est réservée avant l'envoi
    const { error } = await a.from('reminders_sent').insert({ key: it.key })
    if (error) continue
    await notifyUsers(it.ws, [it.user], { type: it.type, title: it.title, body: it.type === 'alert' ? 'Ouvre Agent 1, 2 et 3 dans MXterm et dis-leur « au travail » : chacun reprend ses tâches Flow.' : null, url: it.url })
    sent++
  }
  return NextResponse.json({ ok: true, checked: items.length, sent })
}
