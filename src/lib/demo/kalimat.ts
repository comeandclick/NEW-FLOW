/* eslint-disable @typescript-eslint/no-explicit-any */
import { DEMO_USER_ID } from './constants'
import type { DemoDB, Row } from './mock-client'
import { channels, eventDay, events, files, goals, messages, mdToDoc, notes, projects, tasks, KALIMAT_NAME, KALIMAT_SLUG } from './kalimat-data'

const uid = (prefix: string, n: number) => {
  const hex = prefix.split('').map((c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('').padEnd(8, '0').slice(0, 8)
  return `${hex}-0000-4000-8000-${String(n).padStart(12, '0')}`
}

/** Adds the "Kalimat" workspace (real project content) to the demo database. */
export function addKalimat(db: DemoDB, now = new Date()) {
  const ME = DEMO_USER_ID
  const WS = uid('kws', 1)
  const created = new Date(now.getTime() - 14 * 864e5).toISOString()
  const ago = (min: number) => new Date(now.getTime() - min * 60_000).toISOString()
  const day = (d: number) => { const x = new Date(now); x.setDate(x.getDate() + d); return x.toISOString() }

  db.workspaces.push({ id: WS, name: KALIMAT_NAME, slug: KALIMAT_SLUG, logo_url: null, owner_id: ME, plan: 'free', settings: {}, created_at: created, updated_at: created })
  db.workspace_members.push({ id: uid('kwm', 1), workspace_id: WS, user_id: ME, role: 'owner', invited_by: null, joined_at: created })

  const pid = Object.fromEntries(projects.map((p, i) => [p.key, uid('kproj', i + 1)]))
  projects.forEach((p, i) => db.projects.push({ id: pid[p.key], workspace_id: WS, name: p.name, description: p.description, color: p.color, icon: null, status: 'active', created_by: ME, created_at: created, updated_at: created, deleted_at: null }))

  tasks.forEach((t, i) => db.tasks.push({
    id: uid('ktask', i + 1), workspace_id: WS, project_id: pid[t.project], parent_id: null, title: t.title, description: t.description ?? null,
    status: t.status, priority: t.priority ?? 'medium', assignee_id: ME, created_by: ME, due_date: t.due === undefined ? null : day(t.due),
    completed_at: t.status === 'done' ? ago(60 * (i + 2)) : null, position: i * 1000, tags: t.tags ?? [], estimate_minutes: null,
    created_at: ago(60 * 24 * 6 - i * 20), updated_at: ago(30 + i * 15), deleted_at: null,
  }))

  notes.forEach((n, i) => db.notes.push({
    id: uid('knote', i + 1), workspace_id: WS, project_id: n.project ? pid[n.project] : null, parent_id: null, kind: n.kind, title: n.title, icon: n.icon,
    content: mdToDoc(n.md), tags: n.tags, is_pinned: !!n.pinned, created_by: ME, created_at: ago(60 * 24 * 5 - i * 90), updated_at: ago(120 + i * 200), deleted_at: null,
  }))

  events.forEach((e, i) => {
    const d = eventDay(e.at, now)
    const start = new Date(d); start.setHours(e.start, 0, 0, 0)
    const end = new Date(d); end.setHours(e.end, e.end === e.start ? 0 : 0, 0, 0)
    db.events.push({
      id: uid('kevent', i + 1), workspace_id: WS, title: e.title, description: e.description ?? null, start_at: start.toISOString(), end_at: (e.allDay ? new Date(d.getTime() + 86_399_000) : end).toISOString(),
      all_day: !!e.allDay, color: e.color, location: e.location ?? null, attendees: [ME], task_id: null, meeting_id: null, created_by: ME, created_at: created, updated_at: created, deleted_at: null,
    })
  })

  goals.forEach((g, i) => {
    const id = uid('kgoal', i + 1)
    db.goals.push({ id, workspace_id: WS, title: g.title, description: g.description, target: g.target, current: g.current, unit: g.unit, status: g.current >= g.target ? 'completed' : 'active', color: g.color, due_date: day(g.due).slice(0, 10), created_by: ME, created_at: created, updated_at: created, deleted_at: null })
    g.krs.forEach((k, j) => db.key_results.push({ id: uid('kkr', i * 10 + j + 1), workspace_id: WS, goal_id: id, title: k.title, target: k.target, current: k.current, unit: k.unit, created_at: created }))
  })

  files.forEach((f, i) => db.files.push({
    id: uid('kfile', i + 1), workspace_id: WS, folder: f.folder, name: f.name, size: 4_000 + ((i * 7919) % 50_000), mime_type: f.mime, storage_path: `${WS}/demo/${i + 1}-${f.name}`,
    uploaded_by: ME, created_at: ago(60 * 24 * 4 - i * 30), deleted_at: null,
  }))

  const convId: Record<string, string> = {}
  channels.forEach((c, i) => {
    const id = uid('kconv', i + 1); convId[c.name] = id
    db.conversations.push({ id, workspace_id: WS, type: 'channel', name: c.name, description: c.description, is_private: false, created_by: ME, created_at: created, updated_at: ago(60 * i + 30) })
    db.conversation_members.push({ id: uid('kcm', i + 1), conversation_id: id, user_id: ME, role: 'owner', last_read_at: ago(5), muted: false, joined_at: created })
  })
  messages.forEach((m, i) => db.messages.push({
    id: uid('kmsg', i + 1), conversation_id: convId[m.channel], user_id: ME, content: m.text, parent_id: null, kind: 'text', attachments: [], mentions: [], is_pinned: i === 0, is_edited: false, deleted_at: null,
    created_at: ago(m.minutesAgo), updated_at: ago(m.minutesAgo),
  }))

  const ms: Row[] = [
    ['task.completed', 'Quiz de classe unifié', 120], ['task.completed', 'Nettoyage des réglages', 200], ['note.updated', 'Journal de reprise : 8 octobre 2026', 260],
    ['task.created', 'Écrire les tests automatisés', 400], ['event.created', 'Activation du compte Apple Developer', 800],
  ].map(([action, title, min], i) => ({ id: uid('kact', i + 1), workspace_id: WS, user_id: ME, action, entity_type: String(action).split('.')[0], entity_id: null, meta: { title }, created_at: ago(min as number) }))
  db.activity_logs.push(...ms)
}
