'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { format, isPast, isToday } from 'date-fns'
import { getDb } from '@/lib/supabase/client'
import type { Locale } from '@/i18n/config'

export type AiAction = { type: 'create_task'; title: string } | { type: 'create_note'; title: string; body?: string } | { type: 'create_event'; title: string; at: string }
export type AiContext = { wsId: string; userId: string; locale: Locale }

/** Compact snapshot of the workspace, used by both the local engine and the remote model. */
export async function buildContext(wsId: string, userId: string) {
  const db = getDb()
  const [tasks, events, notes] = await Promise.all([
    db.from('tasks').select('id,title,status,priority,due_date,assignee_id').eq('workspace_id', wsId).is('deleted_at', null).limit(80),
    db.from('events').select('title,start_at,end_at').eq('workspace_id', wsId).is('deleted_at', null).gte('end_at', new Date().toISOString()).order('start_at', { ascending: true }).limit(10),
    db.from('notes').select('title,updated_at').eq('workspace_id', wsId).is('deleted_at', null).order('updated_at', { ascending: false }).limit(8),
  ])
  return { userId, tasks: (tasks.data ?? []) as any[], events: (events.data ?? []) as any[], notes: (notes.data ?? []) as any[] }
}

export async function runAction(a: AiAction, ctx: AiContext) {
  const db = getDb()
  if (a.type === 'create_task') await db.from('tasks').insert({ workspace_id: ctx.wsId, created_by: ctx.userId, assignee_id: ctx.userId, title: a.title, status: 'todo', priority: 'medium', position: Date.now(), tags: [] })
  if (a.type === 'create_note') await db.from('notes').insert({ workspace_id: ctx.wsId, created_by: ctx.userId, title: a.title, content: { type: 'doc', content: [{ type: 'paragraph', content: a.body ? [{ type: 'text', text: a.body }] : [] }] } })
  if (a.type === 'create_event') await db.from('events').insert({ workspace_id: ctx.wsId, created_by: ctx.userId, title: a.title, start_at: a.at, end_at: new Date(new Date(a.at).getTime() + 3600_000).toISOString(), attendees: [ctx.userId] })
}

/** Rule-based assistant (FR/EN) that works offline and in demo mode. */
export async function localAssistant(input: string, ctx: AiContext): Promise<{ text: string; actions: AiAction[] }> {
  const fr = ctx.locale === 'fr'
  const snap = await buildContext(ctx.wsId, ctx.userId)
  const q = input.toLowerCase()
  const open = snap.tasks.filter((t) => !['done', 'cancelled'].includes(t.status))
  const mine = open.filter((t) => t.assignee_id === ctx.userId)
  const overdue = open.filter((t) => t.due_date && isPast(new Date(t.due_date)) && !isToday(new Date(t.due_date)))
  const list = (items: any[]) => items.slice(0, 6).map((t) => `• ${t.title}${t.due_date ? ` (${format(new Date(t.due_date), 'd/MM')})` : ''}`).join('\n')

  const create = input.match(/(?:cr[ée]{1,2}r?|ajoute(?:r)?|nouvelle|add|create|new)\s+(?:une?\s+)?(?:t[âa]che|task|todo)\s*[:\-–]?\s*(.+)/i)
  if (create?.[1]) { const title = create[1].trim().replace(/[.!]$/, ''); return { text: fr ? `C’est fait : j’ai créé la tâche « ${title} » et je vous l’ai assignée.` : `Done: I created the task “${title}” and assigned it to you.`, actions: [{ type: 'create_task', title }] } }
  const note = input.match(/(?:r[ée]dige(?:r)?|cr[ée]{1,2}r?|[ée]cris|draft|write|create)\s+(?:une?\s+)?(?:note|document)\s*[:\-–]?\s*(.+)/i)
  if (note?.[1]) { const title = note[1].trim(); return { text: fr ? `J’ai créé la note « ${title} » : retrouvez-la dans Notes.` : `I created the note “${title}” — find it under Notes.`, actions: [{ type: 'create_note', title, body: fr ? `Brouillon : ${title}\n\n` : `Draft: ${title}\n\n` }] } }
  if (/retard|overdue|late/.test(q)) return { text: overdue.length ? `${fr ? `Vous avez ${overdue.length} tâche(s) en retard` : `You have ${overdue.length} overdue task(s)`} :\n${list(overdue)}` : (fr ? 'Aucune tâche en retard. Bravo !' : 'No overdue tasks. Nice work!'), actions: [] }
  if (/aujourd|today|plan|priorit/.test(q)) {
    const todayTasks = mine.filter((t) => t.due_date && isToday(new Date(t.due_date)))
    const urgent = mine.filter((t) => ['urgent', 'high'].includes(t.priority))
    const pick = [...new Map([...todayTasks, ...urgent, ...mine].map((t) => [t.id, t])).values()].slice(0, 5)
    const ev = snap.events[0]
    return { text: `${fr ? 'Voici vos priorités' : 'Here are your priorities'} :\n${list(pick) || (fr ? '• Rien d’urgent' : '• Nothing urgent')}${ev ? `\n\n${fr ? 'Prochain événement' : 'Next event'} : ${ev.title} — ${format(new Date(ev.start_at), 'EEE d MMM HH:mm')}` : ''}`, actions: [] }
  }
  if (/r[ée]sum|summar|bilan|overview|statut|status/.test(q)) {
    const done = snap.tasks.filter((t) => t.status === 'done').length
    return { text: fr ? `Résumé : ${snap.tasks.length} tâches (${open.length} ouvertes, ${done} terminées), ${overdue.length} en retard, ${snap.events.length} événements à venir.` : `Summary: ${snap.tasks.length} tasks (${open.length} open, ${done} done), ${overdue.length} overdue, ${snap.events.length} upcoming events.`, actions: [] }
  }
  return { text: fr ? 'Je peux résumer votre espace, lister vos priorités ou les tâches en retard, et créer des tâches ou des notes. Essayez : « Crée une tâche : préparer la démo ».' : 'I can summarize your workspace, list your priorities or overdue tasks, and create tasks or notes. Try: “Create a task: prepare the demo”.', actions: [] }
}
