/**
 * Loads the Kalimat workspace into a real account, as that user (RLS applies).
 * Usage: SEED_EMAIL=you@x.com npx tsx scripts/seed-kalimat.mts   (env from .env.local)
 * The service key is only used to mint a one-off magic-link session for SEED_EMAIL.
 */
import { createClient } from '@supabase/supabase-js'
import { channels, crmContacts, crmDeals, eventDay, events, goals, mdToDoc, messages, notes, projects, tasks, KALIMAT_NAME } from '../src/lib/demo/kalimat-data.ts'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, secret = process.env.SUPABASE_SECRET_KEY!
const email = process.env.SEED_EMAIL!
const admin = createClient(url, secret, { auth: { persistSession: false } })
const ok = (r: { error: { message: string } | null }, w: string) => { if (r.error) throw new Error(`${w}: ${r.error.message}`) }

const { data: link, error: le } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
if (le || !link.properties?.hashed_token) throw new Error(le?.message ?? 'no link')
const db = createClient(url, anon, { auth: { persistSession: false } })
const { data: sess, error: ve } = await db.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token })
if (ve || !sess.user) throw new Error(ve?.message ?? 'verify')
const userId = sess.user.id

const now = new Date()
const day = (d: number) => { const x = new Date(now); x.setDate(x.getDate() + d); return x.toISOString() }
// SEED_WS=<slug> fills an existing workspace of the user instead of creating a new one.
let slug = process.env.SEED_WS ?? `kalimat-${Math.random().toString(36).slice(2, 6)}`
let wsId: string
if (process.env.SEED_WS) {
  const { data: ex, error: xe } = await db.from('workspaces').select('id').eq('slug', slug).single()
  if (xe || !ex) throw new Error(xe?.message ?? 'workspace not found')
  wsId = (ex as any).id
} else {
  const { data: ws, error } = await db.rpc('create_workspace', { p_name: KALIMAT_NAME, p_slug: slug }).single()
  if (error || !ws) throw new Error(error?.message ?? 'workspace')
  wsId = (ws as any).id as string
}

const { data: pr, error: pe } = await db.from('projects').insert(projects.map((p) => ({ workspace_id: wsId, name: p.name, description: p.description, color: p.color, created_by: userId }))).select('id,name')
if (pe || !pr) throw new Error(pe?.message ?? 'projects')
const pid: Record<string, string> = {}
projects.forEach((p) => { pid[p.key] = (pr as any[]).find((r) => r.name === p.name)!.id })

ok(await db.from('tasks').insert(tasks.map((t, i) => ({ workspace_id: wsId, project_id: pid[t.project], title: t.title, description: t.description ?? null, status: t.status, priority: t.priority ?? 'medium', assignee_id: userId, created_by: userId, due_date: t.due === undefined ? null : day(t.due), completed_at: t.status === 'done' ? day(-1) : null, position: i * 1000, tags: t.tags ?? [] }))), 'tasks')
ok(await db.from('notes').insert(notes.map((n) => ({ workspace_id: wsId, project_id: n.project ? pid[n.project] : null, kind: n.kind, title: n.title, icon: n.icon, content: mdToDoc(n.md), tags: n.tags, is_pinned: !!n.pinned, created_by: userId }))), 'notes')
ok(await db.from('events').insert(events.map((e) => {
  const d = eventDay(e.at, now); const start = new Date(d); start.setHours(e.start, 0, 0, 0)
  const end = e.allDay ? new Date(d.getTime() + 86_399_000) : new Date(new Date(d).setHours(e.end, 0, 0, 0))
  return { workspace_id: wsId, title: e.title, description: e.description ?? null, start_at: start.toISOString(), end_at: end.toISOString(), all_day: !!e.allDay, color: e.color, attendees: [userId], created_by: userId }
})), 'events')
for (const g of goals) {
  const { data: row, error: ge } = await db.from('goals').insert({ workspace_id: wsId, title: g.title, description: g.description, target: g.target, current: g.current, unit: g.unit, color: g.color, status: g.current >= g.target ? 'completed' : 'active', due_date: day(g.due).slice(0, 10), created_by: userId }).select('id').single()
  if (ge || !row) throw new Error(ge?.message ?? 'goal')
  ok(await db.from('key_results').insert(g.krs.map((k) => ({ workspace_id: wsId, goal_id: (row as any).id, title: k.title, target: k.target, current: k.current, unit: k.unit }))), 'key_results')
}
const { data: cts, error: ce } = await db.from('crm_contacts').insert(crmContacts.map((c) => ({ workspace_id: wsId, name: c.name, company: c.company, position: c.position, status: c.status, tags: [...c.tags], notes: c.notes, created_by: userId }))).select('id,name')
ok({ error: ce }, 'crm_contacts')
const cid: Record<string, string> = {}
crmContacts.forEach((c) => { cid[c.key] = ((cts ?? []) as any[]).find((r) => r.name === c.name)?.id })
ok(await db.from('crm_deals').insert(crmDeals.map((d, i) => ({ workspace_id: wsId, contact_id: cid[d.contact], title: d.title, value: d.value, stage: d.stage, probability: d.probability, close_date: day(d.close).slice(0, 10), position: i * 1000, created_by: userId }))), 'crm_deals')

const { data: convs } = await db.from('conversations').select('id,name').eq('workspace_id', wsId)
const byName: Record<string, string> = Object.fromEntries(((convs ?? []) as any[]).map((c) => [c.name, c.id]))
for (const c of channels) {
  if (byName[c.name]) { await db.from('conversations').update({ description: c.description }).eq('id', byName[c.name]); continue }
  const { data: row } = await db.from('conversations').insert({ workspace_id: wsId, type: 'channel', name: c.name, description: c.description, created_by: userId }).select('id').single()
  if (row) { byName[c.name] = (row as any).id; await db.from('conversation_members').insert({ conversation_id: (row as any).id, user_id: userId, role: 'owner' }) }
}
for (const m of messages) if (byName[m.channel]) await db.from('messages').insert({ conversation_id: byName[m.channel], user_id: userId, kind: 'text', content: m.text })

for (const n of notes) {
  const name = `${n.title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')}.md`
  const body = new Blob([n.md], { type: 'text/markdown' })
  const path = `${wsId}/${crypto.randomUUID().slice(0, 8)}-${name.replace(/[^\w.\-]+/g, '_')}`
  const up = await db.storage.from('files').upload(path, body, { contentType: 'text/markdown' })
  if (up.error) { console.warn('upload', name, up.error.message); continue }
  await db.from('files').insert({ workspace_id: wsId, folder: '/Documents', name, size: body.size, mime_type: 'text/markdown', storage_path: path, uploaded_by: userId })
}
console.log(`ok ${email} -> /app/${slug}`)
