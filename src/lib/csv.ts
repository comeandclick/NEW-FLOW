/** CSV and spreadsheet-friendly import / export for tasks and contacts (Trello, Notion, Excel, Google Sheets exports included). */
import type { Priority, TaskStatus } from '@/lib/types'

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '')
  // Semicolon-separated files (French Excel) are detected on the header line.
  const first = src.split(/\r?\n/, 1)[0] ?? ''
  const sep = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = [], cell = '', q = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (q) { if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++ } else q = false } else cell += c }
    else if (c === '"') q = true
    else if (c === sep) { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && src[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = '' }
    else cell += c
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows.filter((r) => r.some((x) => x.trim() !== ''))
}

export const csvCell = (s: string) => (/[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
export const toCsv = (rows: string[][]) => '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\n')

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Header → canonical field, for French, English and Trello-style files. */
function columnMap(header: string[], aliases: Record<string, string[]>): Record<string, number> {
  const out: Record<string, number> = {}
  header.forEach((h, i) => {
    const n = norm(h)
    for (const [field, names] of Object.entries(aliases)) if (!(field in out) && names.includes(n)) out[field] = i
  })
  return out
}

const STATUS_WORDS: Record<TaskStatus, string[]> = {
  backlog: ['backlog', 'idees', 'ideas', 'icebox', 'someday'],
  todo: ['todo', 'to do', 'a faire', 'afaire', 'open', 'ouvert', 'new', 'nouveau', 'planned', 'prevu'],
  in_progress: ['in progress', 'doing', 'en cours', 'wip', 'started', 'commence'],
  in_review: ['in review', 'review', 'en revue', 'a valider', 'testing', 'qa', 'en test'],
  done: ['done', 'termine', 'terminee', 'fini', 'finished', 'complete', 'completed', 'closed', 'ferme', 'shipped'],
  cancelled: ['cancelled', 'canceled', 'annule', 'abandonne', 'wontfix', 'rejected'],
}
export function toStatus(v: string): TaskStatus {
  const n = norm(v)
  for (const [s, words] of Object.entries(STATUS_WORDS)) if (words.includes(n)) return s as TaskStatus
  return 'todo'
}
const PRIORITY_WORDS: Record<Priority, string[]> = {
  urgent: ['urgent', 'critical', 'critique', 'p0', 'blocker', 'bloquant'],
  high: ['high', 'haute', 'haut', 'eleve', 'elevee', 'important', 'p1'],
  medium: ['medium', 'moyenne', 'moyen', 'normal', 'normale', 'p2'],
  low: ['low', 'basse', 'bas', 'faible', 'minor', 'mineur', 'p3'],
}
export function toPriority(v: string): Priority {
  const n = norm(v)
  for (const [p, words] of Object.entries(PRIORITY_WORDS)) if (words.includes(n)) return p as Priority
  return 'medium'
}

/** dd/mm/yyyy, yyyy-mm-dd, "Jan 5, 2026" and ISO strings. Returns an ISO string at 18:00 local, or null. */
export function toDate(v: string): string | null {
  const s = v.trim()
  if (!s) return null
  let d: Date | null = null
  const fr = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:\s.*)?$/)
  if (fr) d = new Date(Number(fr[3].length === 2 ? `20${fr[3]}` : fr[3]), Number(fr[2]) - 1, Number(fr[1]), 18)
  else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const [y, m, dd] = s.split('-').map(Number); d = new Date(y, m - 1, dd, 18) }
  else { const t = Date.parse(s); if (!Number.isNaN(t)) d = new Date(t) }
  return d && !Number.isNaN(+d) ? d.toISOString() : null
}

export type TaskDraft = { title: string; description: string | null; status: TaskStatus; priority: Priority; due_date: string | null; tags: string[]; estimate_minutes: number | null; project: string | null; assignee: string | null }
export type Ctx = { projects: { id: string; name: string }[]; members: { user_id: string; email?: string | null; name?: string | null }[] }

const TASK_ALIASES: Record<string, string[]> = {
  title: ['title', 'titre', 'name', 'nom', 'task', 'tache', 'card name', 'summary', 'resume', 'intitule'],
  description: ['description', 'details', 'detail', 'notes', 'card description', 'body', 'contenu'],
  status: ['status', 'statut', 'state', 'etat', 'list name', 'list', 'liste', 'colonne', 'column'],
  priority: ['priority', 'priorite'],
  due: ['due date', 'due', 'echeance', 'date d echeance', 'deadline', 'date limite', 'date'],
  tags: ['tags', 'labels', 'label', 'etiquettes', 'etiquette'],
  estimate: ['estimate', 'estimation', 'estimate minutes', 'minutes', 'duree'],
  project: ['project', 'projet', 'board', 'board name'],
  assignee: ['assignee', 'assigned to', 'responsable', 'assigne', 'assigne a', 'members', 'membres', 'owner'],
}

export function parseTasksCsv(text: string): { tasks: TaskDraft[]; skipped: number; columns: string[] } | null {
  const rows = parseCsv(text)
  if (rows.length < 2) return null
  const map = columnMap(rows[0], TASK_ALIASES)
  if (!('title' in map)) return null
  const get = (r: string[], f: string) => (f in map ? (r[map[f]] ?? '').trim() : '')
  const tasks: TaskDraft[] = []
  let skipped = 0
  for (const r of rows.slice(1)) {
    const title = get(r, 'title')
    if (!title) { skipped++; continue }
    const est = Number(get(r, 'estimate').replace(',', '.'))
    tasks.push({
      title: title.slice(0, 300), description: get(r, 'description') || null, status: 'status' in map ? toStatus(get(r, 'status')) : 'todo',
      priority: toPriority(get(r, 'priority')), due_date: toDate(get(r, 'due')),
      tags: get(r, 'tags').split(/[,;|]/).map((x) => x.trim()).filter(Boolean).slice(0, 20), estimate_minutes: Number.isFinite(est) && est > 0 ? Math.round(est) : null,
      project: get(r, 'project') || null, assignee: get(r, 'assignee') || null,
    })
  }
  return { tasks, skipped, columns: Object.keys(map) }
}

export function resolveProject(name: string | null, ctx: Ctx): string | null {
  if (!name) return null
  return ctx.projects.find((p) => norm(p.name) === norm(name))?.id ?? null
}
export function resolveAssignee(v: string | null, ctx: Ctx): string | null {
  if (!v) return null
  const n = norm(v.split(/[,;]/)[0])
  return ctx.members.find((m) => (m.email && norm(m.email) === n) || (m.name && norm(m.name) === n))?.user_id ?? null
}

export function tasksToCsv(tasks: { title: string; description: string | null; status: string; priority: string; due_date: string | null; tags: string[]; estimate_minutes: number | null; project_id: string | null; assignee_id: string | null }[], ctx: Ctx): string {
  const head = ['title', 'description', 'status', 'priority', 'due_date', 'tags', 'estimate_minutes', 'project', 'assignee']
  const rows = tasks.map((t) => [t.title, t.description ?? '', t.status, t.priority, t.due_date ? t.due_date.slice(0, 10) : '', t.tags.join(', '), t.estimate_minutes?.toString() ?? '',
    ctx.projects.find((p) => p.id === t.project_id)?.name ?? '', ctx.members.find((m) => m.user_id === t.assignee_id)?.email ?? ''])
  return toCsv([head, ...rows])
}

const CONTACT_ALIASES: Record<string, string[]> = {
  name: ['name', 'nom', 'full name', 'nom complet', 'contact', 'prenom nom'],
  email: ['email', 'e mail', 'mail', 'courriel', 'adresse e mail', 'email address'],
  phone: ['phone', 'telephone', 'tel', 'mobile', 'phone number', 'portable'],
  company: ['company', 'societe', 'entreprise', 'organisation', 'organization', 'company name'],
  position: ['position', 'poste', 'title', 'job title', 'fonction'],
  status: ['status', 'statut', 'stage'],
  tags: ['tags', 'labels', 'etiquettes'],
  notes: ['notes', 'note', 'comments', 'commentaires'],
}
export type ContactDraft = { name: string; email: string | null; phone: string | null; company: string | null; position: string | null; status: string; tags: string[]; notes: string | null }
export function parseContactsCsv(text: string): { contacts: ContactDraft[]; skipped: number } | null {
  const rows = parseCsv(text)
  if (rows.length < 2) return null
  const map = columnMap(rows[0], CONTACT_ALIASES)
  if (!('name' in map) && !('email' in map)) return null
  const get = (r: string[], f: string) => (f in map ? (r[map[f]] ?? '').trim() : '')
  const contacts: ContactDraft[] = []
  let skipped = 0
  for (const r of rows.slice(1)) {
    const email = get(r, 'email') || null
    const name = get(r, 'name') || (email ? email.split('@')[0] : '')
    if (!name) { skipped++; continue }
    const st = norm(get(r, 'status'))
    contacts.push({ name: name.slice(0, 200), email, phone: get(r, 'phone') || null, company: get(r, 'company') || null, position: get(r, 'position') || null,
      status: ['lead', 'customer', 'client', 'prospect', 'partner', 'partenaire'].includes(st) ? (st === 'client' ? 'customer' : st === 'partenaire' ? 'partner' : st) : 'lead',
      tags: get(r, 'tags').split(/[,;|]/).map((x) => x.trim()).filter(Boolean).slice(0, 20), notes: get(r, 'notes') || null })
  }
  return { contacts, skipped }
}
export function contactsToCsv(c: { name: string; email: string | null; phone: string | null; company: string | null; position: string | null; status: string; tags: string[]; notes: string | null }[]): string {
  return toCsv([['name', 'email', 'phone', 'company', 'position', 'status', 'tags', 'notes'], ...c.map((x) => [x.name, x.email ?? '', x.phone ?? '', x.company ?? '', x.position ?? '', x.status, x.tags.join(', '), x.notes ?? ''])])
}
