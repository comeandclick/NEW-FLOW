/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Minimal in-memory stand-in for the Supabase client, used by the demo mode
 * (no backend required). Implements the subset of the query builder, auth,
 * realtime and storage APIs that the app relies on.
 */
import { DEMO_USER_ID } from './constants'

export type Row = Record<string, any>
export type DemoDB = Record<string, Row[]>

type Listener = (payload: any) => void
type ChannelBinding = { type: string; filter: Record<string, any>; cb: Listener }

// ── Column defaults (so freshly inserted rows have every FK key present) ─────
const nul = null
const COLUMN_DEFAULTS: Record<string, Row> = {
  profiles: { full_name: nul, avatar_url: nul, locale: 'fr', timezone: 'Europe/Paris', status: 'online', is_admin: false, preferences: {} },
  workspaces: { logo_url: nul, plan: 'free', settings: {} },
  workspace_members: { role: 'member', invited_by: nul },
  invitations: { role: 'member', invited_by: nul, message: nul, accepted_at: nul },
  projects: { description: nul, color: '#6366f1', icon: nul, status: 'active', created_by: nul, deleted_at: nul },
  tasks: {
    project_id: nul, parent_id: nul, description: nul, status: 'todo', priority: 'medium', assignee_id: nul, created_by: nul,
    due_date: nul, completed_at: nul, position: 0, tags: [], estimate_minutes: nul, deleted_at: nul,
  },
  task_comments: {},
  notes: { project_id: nul, parent_id: nul, kind: 'note', title: '', icon: nul, content: {}, tags: [], is_pinned: false, created_by: nul, deleted_at: nul },
  note_versions: { title: nul, saved_by: nul },
  events: { description: nul, all_day: false, color: nul, location: nul, attendees: [], task_id: nul, created_by: nul, deleted_at: nul },
  conversations: { name: nul, description: nul, is_private: false, created_by: nul },
  conversation_members: { role: 'member', muted: false },
  messages: { content: nul, parent_id: nul, kind: 'text', attachments: [], mentions: [], is_pinned: false, is_edited: false, deleted_at: nul },
  reactions: {},
  files: { folder: '/', size: nul, mime_type: nul, uploaded_by: nul, deleted_at: nul },
  meetings: { description: nul, host_id: nul, status: 'scheduled', scheduled_at: nul, started_at: nul, ended_at: nul, summary: nul, deleted_at: nul },
  goals: { description: nul, target: 100, current: 0, unit: '%', status: 'active', color: nul, due_date: nul, created_by: nul, deleted_at: nul },
  key_results: { target: 100, current: 0, unit: '%' },
  crm_contacts: { email: nul, phone: nul, company: nul, position: nul, status: 'lead', tags: [], notes: nul, created_by: nul, deleted_at: nul },
  crm_deals: { contact_id: nul, value: 0, currency: 'EUR', stage: 'prospection', probability: 10, close_date: nul, position: 0, created_by: nul, deleted_at: nul },
  automations: { trigger_config: {}, action_config: {}, is_active: true, run_count: 0, last_run_at: nul, created_by: nul },
  whiteboards: { name: 'Tableau', items: [], created_by: nul, deleted_at: nul },
  habits: { color: '#22c55e', target_per_week: 7, deleted_at: nul },
  habit_logs: {},
  time_entries: { task_id: nul, project_id: nul, note: nul, kind: 'work', ended_at: nul },
  invoices: { kind: 'invoice', contact_id: nul, status: 'draft', currency: 'EUR', items: [], total: 0, due_at: nul, created_by: nul, deleted_at: nul },
  forms: { description: nul, fields: [], is_public: false, created_by: nul, deleted_at: nul },
  form_responses: { answers: {} },
  notifications: { workspace_id: nul, body: nul, url: nul, is_read: false },
  push_subscriptions: {},
  activity_logs: { user_id: nul, entity_type: nul, entity_id: nul, meta: {} },
  favorites: {},
}

const TABLES_WITHOUT_UPDATED_AT = new Set([
  'workspace_members', 'invitations', 'task_comments', 'note_versions', 'conversation_members', 'reactions', 'files', 'meetings',
  'key_results', 'habits', 'habit_logs', 'time_entries', 'invoices', 'forms', 'form_responses', 'notifications', 'push_subscriptions',
  'activity_logs', 'favorites',
])

// ── utils ────────────────────────────────────────────────────────────────────
export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

const clone = <T,>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)))
const singular = (t: string) => (t.endsWith('ies') ? t.slice(0, -3) + 'y' : t.endsWith('s') ? t.slice(0, -1) : t)

function normalizeCompare(v: any): any {
  if (v instanceof Date) return v.toISOString()
  return v
}

function cmp(a: any, b: any): number {
  a = normalizeCompare(a)
  b = normalizeCompare(b)
  if (a === b) return 0
  if (a === null || a === undefined) return -1
  if (b === null || b === undefined) return 1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a) < String(b) ? -1 : 1
}

function likeToRegex(pattern: string, ci: boolean) {
  const esc = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.')
  return new RegExp(`^${esc}$`, ci ? 'i' : '')
}

function parseValue(op: string, raw: string): any {
  if (op === 'is') return raw === 'null' ? null : raw === 'true' ? true : raw === 'false' ? false : raw
  if (op === 'in') return raw.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, ''))
  return raw
}

function matchOp(rowVal: any, op: string, val: any): boolean {
  switch (op) {
    case 'eq': return rowVal === val || (rowVal !== null && rowVal !== undefined && val !== null && String(rowVal) === String(val))
    case 'neq': return !matchOp(rowVal, 'eq', val)
    case 'gt': return rowVal !== null && rowVal !== undefined && cmp(rowVal, val) > 0
    case 'gte': return rowVal !== null && rowVal !== undefined && cmp(rowVal, val) >= 0
    case 'lt': return rowVal !== null && rowVal !== undefined && cmp(rowVal, val) < 0
    case 'lte': return rowVal !== null && rowVal !== undefined && cmp(rowVal, val) <= 0
    case 'is': return (rowVal ?? null) === val
    case 'in': return Array.isArray(val) && val.some((v) => matchOp(rowVal, 'eq', v))
    case 'like': return typeof rowVal === 'string' && likeToRegex(String(val), false).test(rowVal)
    case 'ilike': return typeof rowVal === 'string' && likeToRegex(String(val), true).test(rowVal)
    case 'contains':
      if (Array.isArray(rowVal)) return (Array.isArray(val) ? val : [val]).every((v) => rowVal.includes(v))
      if (rowVal && typeof rowVal === 'object' && val && typeof val === 'object') {
        return Object.entries(val).every(([k, v]) => JSON.stringify(rowVal[k]) === JSON.stringify(v))
      }
      return false
    case 'overlaps': return Array.isArray(rowVal) && Array.isArray(val) && val.some((v) => rowVal.includes(v))
    default: return true
  }
}

// ── select-string parsing ────────────────────────────────────────────────────
type SelItem =
  | { kind: 'col'; name: string }
  | { kind: 'rel'; alias: string; table: string; hint: string | null; inner: boolean; items: SelItem[] }

function splitTop(str: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of str) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) { out.push(cur); cur = '' } else cur += ch
  }
  if (cur.trim()) out.push(cur)
  return out.map((s) => s.trim()).filter(Boolean)
}

function parseSelect(str: string): SelItem[] {
  return splitTop(str || '*').map((part): SelItem => {
    const open = part.indexOf('(')
    if (open === -1) return { kind: 'col', name: part }
    const head = part.slice(0, open)
    const inner = part.slice(open + 1, part.lastIndexOf(')'))
    let alias = ''
    let rest = head
    if (head.includes(':')) [alias, rest] = head.split(':')
    const [table, ...mods] = rest.split('!')
    const isInner = mods.includes('inner')
    const hint = mods.find((m) => m !== 'inner') ?? null
    return { kind: 'rel', alias: alias || table, table, hint, inner: isInner, items: parseSelect(inner) }
  })
}

// ── query builder ────────────────────────────────────────────────────────────
type Filter = { col: string; op: string; val: any } | { or: Filter[][] } | { not: Filter }

class QueryBuilder implements PromiseLike<any> {
  private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select'
  private filters: Filter[] = []
  private orders: { col: string; asc: boolean; nullsFirst?: boolean }[] = []
  private lim: number | null = null
  private rangeFrom: number | null = null
  private rangeTo: number | null = null
  private selStr: string | null = null
  private payload: any = null
  private upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } = {}
  private wantSingle: 'single' | 'maybe' | null = null
  private countMode: string | null = null
  private head = false

  constructor(private client: MockClient, private table: string) {}

  select(str = '*', opts?: { count?: string; head?: boolean }) {
    if (this.op === 'select') this.selStr = str
    else this.selStr = str
    if (opts?.count) this.countMode = opts.count
    if (opts?.head) this.head = true
    return this
  }
  insert(values: any) { this.op = 'insert'; this.payload = values; return this }
  update(values: any) { this.op = 'update'; this.payload = values; return this }
  upsert(values: any, opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.op = 'upsert'; this.payload = values; this.upsertOpts = opts ?? {}; return this
  }
  delete() { this.op = 'delete'; return this }

  eq(col: string, val: any) { return this.f(col, 'eq', val) }
  neq(col: string, val: any) { return this.f(col, 'neq', val) }
  gt(col: string, val: any) { return this.f(col, 'gt', val) }
  gte(col: string, val: any) { return this.f(col, 'gte', val) }
  lt(col: string, val: any) { return this.f(col, 'lt', val) }
  lte(col: string, val: any) { return this.f(col, 'lte', val) }
  is(col: string, val: any) { return this.f(col, 'is', val) }
  in(col: string, val: any[]) { return this.f(col, 'in', val) }
  like(col: string, val: string) { return this.f(col, 'like', val) }
  ilike(col: string, val: string) { return this.f(col, 'ilike', val) }
  contains(col: string, val: any) { return this.f(col, 'contains', val) }
  overlaps(col: string, val: any) { return this.f(col, 'overlaps', val) }
  match(obj: Row) { Object.entries(obj).forEach(([k, v]) => this.f(k, 'eq', v)); return this }
  filter(col: string, op: string, val: any) { return this.f(col, op, parseValue(op, String(val))) }
  not(col: string, op: string, val: any) {
    this.filters.push({ not: { col, op, val: typeof val === 'string' ? parseValue(op, val) : val } })
    return this
  }
  or(expr: string) {
    const alternatives = splitTop(expr).map((part): Filter[] => {
      const m = part.match(/^([^.]+)\.([a-z]+)\.(.*)$/)
      if (!m) return []
      return [{ col: m[1], op: m[2], val: parseValue(m[2], m[3]) }]
    })
    this.filters.push({ or: alternatives })
    return this
  }
  private f(col: string, op: string, val: any) { this.filters.push({ col, op, val }); return this }

  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.orders.push({ col, asc: opts?.ascending !== false, nullsFirst: opts?.nullsFirst })
    return this
  }
  limit(n: number) { this.lim = n; return this }
  range(from: number, to: number) { this.rangeFrom = from; this.rangeTo = to; return this }
  single() { this.wantSingle = 'single'; return this }
  maybeSingle() { this.wantSingle = 'maybe'; return this }
  returns() { return this }
  abortSignal() { return this }

  then<R1 = any, R2 = never>(
    onfulfilled?: ((value: any) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: any) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    let result: any
    try {
      result = this.execute()
    } catch (e: any) {
      result = { data: null, error: { message: e?.message ?? 'mock error', code: 'MOCK' }, count: null }
    }
    return Promise.resolve(result).then(onfulfilled, onrejected)
  }

  // ── execution ──
  private matches(row: Row, f: Filter): boolean {
    if ('or' in f) return f.or.some((group) => group.every((g) => this.matches(row, g)))
    if ('not' in f) return !this.matches(row, f.not)
    return matchOp(row[f.col], f.op, f.val)
  }

  private matchedRows(): Row[] {
    const rows = this.client.db[this.table] ?? []
    return rows.filter((r) => this.filters.every((f) => this.matches(r, f)))
  }

  private applyOrderAndRange(rows: Row[]): Row[] {
    let out = rows
    if (this.orders.length) {
      out = [...rows].sort((a, b) => {
        for (const o of this.orders) {
          const c = cmp(a[o.col], b[o.col])
          if (c !== 0) return o.asc ? c : -c
        }
        return 0
      })
    }
    if (this.rangeFrom !== null && this.rangeTo !== null) out = out.slice(this.rangeFrom, this.rangeTo + 1)
    if (this.lim !== null) out = out.slice(0, this.lim)
    return out
  }

  private project(rows: Row[], str: string): Row[] {
    const items = parseSelect(str)
    return this.client.projectRows(this.table, rows, items)
  }

  private wrap(rows: Row[], count: number | null): any {
    const selected = this.selStr !== null ? this.project(rows, this.selStr) : rows.map(clone)
    if (this.head) return { data: null, error: null, count }
    if (this.wantSingle) {
      if (selected.length === 1) return { data: selected[0], error: null, count }
      if (selected.length === 0) {
        if (this.wantSingle === 'maybe') return { data: null, error: null, count }
        return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116', details: 'The result contains 0 rows' }, count }
      }
      if (this.wantSingle === 'maybe') return { data: null, error: { message: 'multiple rows returned', code: 'PGRST116' }, count }
      return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' }, count }
    }
    return { data: selected, error: null, count }
  }

  private execute(): any {
    const db = this.client.db
    if (!db[this.table]) db[this.table] = []

    if (this.op === 'select') {
      const matched = this.matchedRows()
      let rows = this.applyOrderAndRange(matched)
      if (this.selStr && /!inner/.test(this.selStr)) {
        rows = this.client.filterInner(this.table, rows, parseSelect(this.selStr))
      }
      return this.wrap(rows, this.countMode ? matched.length : null)
    }

    if (this.op === 'insert' || this.op === 'upsert') {
      const list: Row[] = Array.isArray(this.payload) ? this.payload : [this.payload]
      const out: Row[] = []
      for (const raw of list) {
        let existing: Row | undefined
        if (this.op === 'upsert') {
          const keys = (this.upsertOpts.onConflict ?? 'id').split(',').map((s) => s.trim())
          existing = db[this.table].find((r) => keys.every((k) => raw[k] !== undefined && r[k] === raw[k]))
        }
        if (existing) {
          if (!this.upsertOpts.ignoreDuplicates) {
            Object.assign(existing, clone(raw))
            if (!TABLES_WITHOUT_UPDATED_AT.has(this.table)) existing.updated_at = new Date().toISOString()
            this.client.emit(this.table, 'UPDATE', existing, existing)
          }
          out.push(existing)
          continue
        }
        const now = new Date().toISOString()
        const row: Row = {
          ...(COLUMN_DEFAULTS[this.table] ?? {}),
          ...clone(raw),
        }
        if (!row.id) row.id = uuid()
        if (!row.created_at) row.created_at = now
        if (!TABLES_WITHOUT_UPDATED_AT.has(this.table) && !row.updated_at) row.updated_at = now
        if (this.table === 'workspace_members' && !row.joined_at) row.joined_at = now
        if (this.table === 'conversation_members') { row.joined_at ??= now; row.last_read_at ??= now }
        if (this.table === 'invitations') { row.token ??= uuid().replace(/-/g, ''); row.expires_at ??= new Date(Date.now() + 7 * 864e5).toISOString() }
        if (this.table === 'meetings') row.room ??= uuid().replace(/-/g, '').slice(0, 16)
        if (this.table === 'forms') row.slug ??= uuid().replace(/-/g, '').slice(0, 10)
        db[this.table].push(row)
        out.push(row)
        this.client.emit(this.table, 'INSERT', row, null)
      }
      this.client.persist()
      return this.wrap(out, out.length)
    }

    if (this.op === 'update') {
      const rows = this.matchedRows()
      for (const row of rows) {
        const old = { ...row }
        Object.assign(row, clone(this.payload))
        if (!TABLES_WITHOUT_UPDATED_AT.has(this.table) && !('updated_at' in (this.payload ?? {}))) {
          row.updated_at = new Date().toISOString()
        }
        this.client.emit(this.table, 'UPDATE', row, old)
      }
      this.client.persist()
      return this.wrap(rows, rows.length)
    }

    // delete
    const rows = this.matchedRows()
    db[this.table] = db[this.table].filter((r) => !rows.includes(r))
    for (const row of rows) this.client.emit(this.table, 'DELETE', null, row)
    this.client.persist()
    return this.wrap(rows, rows.length)
  }
}

// ── realtime channel ─────────────────────────────────────────────────────────
class MockChannel {
  private bindings: ChannelBinding[] = []
  private subscribed = false
  constructor(private client: MockClient, public name: string) {}

  on(type: string, filter: Record<string, any>, cb: Listener) {
    this.bindings.push({ type, filter, cb })
    return this
  }
  subscribe(cb?: (status: string, err?: any) => void) {
    this.subscribed = true
    this.client.channels.add(this)
    setTimeout(() => cb?.('SUBSCRIBED'), 0)
    return this
  }
  unsubscribe() {
    this.subscribed = false
    this.client.channels.delete(this)
    return Promise.resolve('ok')
  }
  async send(msg: { type: string; event: string; payload: any }) {
    if (msg.type === 'broadcast') this.client.broadcast(this, msg.event, msg.payload)
    return 'ok'
  }
  track() { return Promise.resolve('ok') }
  untrack() { return Promise.resolve('ok') }
  presenceState() { return {} }

  deliverChange(table: string, event: string, newRow: Row | null, oldRow: Row | null) {
    if (!this.subscribed) return
    for (const b of this.bindings) {
      if (b.type !== 'postgres_changes') continue
      if (b.filter.table && b.filter.table !== table) continue
      if (b.filter.event && b.filter.event !== '*' && b.filter.event !== event) continue
      if (b.filter.filter) {
        const m = String(b.filter.filter).match(/^([^=]+)=eq\.(.*)$/)
        const subject = newRow ?? oldRow
        if (m && subject && String(subject[m[1]]) !== m[2]) continue
      }
      b.cb({ eventType: event, new: newRow ? clone(newRow) : {}, old: oldRow ? clone(oldRow) : {}, schema: 'public', table })
    }
  }
  deliverBroadcast(event: string, payload: any) {
    if (!this.subscribed) return
    for (const b of this.bindings) {
      if (b.type === 'broadcast' && (b.filter.event === event || b.filter.event === '*')) b.cb({ event, payload })
    }
  }
}

// ── client ───────────────────────────────────────────────────────────────────
export type MockClientOptions = {
  user?: Row | null
  persist?: (db: DemoDB) => void
  onSignOut?: () => void
}

export class MockClient {
  channels = new Set<MockChannel>()
  private files = new Map<string, string>()
  private authListeners = new Set<(event: string, session: any) => void>()

  constructor(public db: DemoDB, private opts: MockClientOptions = {}) {}

  persist() { this.opts.persist?.(this.db) }

  private user() {
    const profile = this.db.profiles?.find((p) => p.id === (this.opts.user?.id ?? DEMO_USER_ID))
    if (this.opts.user === null || !profile) return null
    return {
      id: profile.id,
      email: profile.email,
      aud: 'authenticated',
      role: 'authenticated',
      app_metadata: {},
      user_metadata: { full_name: profile.full_name, avatar_url: profile.avatar_url },
      created_at: profile.created_at,
    }
  }
  private session() {
    const user = this.user()
    return user
      ? { access_token: 'demo', refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user }
      : null
  }

  auth = {
    getSession: async () => ({ data: { session: this.session() }, error: null }),
    getUser: async () => ({ data: { user: this.user() }, error: this.user() ? null : { message: 'Auth session missing!' } }),
    onAuthStateChange: (cb: (event: string, session: any) => void) => {
      this.authListeners.add(cb)
      return { data: { subscription: { unsubscribe: () => this.authListeners.delete(cb) } } }
    },
    signOut: async () => {
      this.opts.onSignOut?.()
      this.authListeners.forEach((cb) => cb('SIGNED_OUT', null))
      return { error: null }
    },
    signInWithPassword: async () => ({ data: { user: this.user(), session: this.session() }, error: null }),
    signInWithOAuth: async () => ({ data: { provider: 'google', url: null }, error: { message: 'Indisponible en mode démo' } }),
    signUp: async () => ({ data: { user: null, session: null }, error: { message: 'Indisponible en mode démo' } }),
    resetPasswordForEmail: async () => ({ data: {}, error: { message: 'Indisponible en mode démo' } }),
    updateUser: async (attrs: Row) => {
      const profile = this.db.profiles.find((p) => p.id === this.user()?.id)
      if (profile && attrs.data?.full_name) { profile.full_name = attrs.data.full_name; this.persist() }
      return { data: { user: this.user() }, error: null }
    },
    exchangeCodeForSession: async () => ({ data: { session: this.session() }, error: null }),
  }

  from(table: string) { return new QueryBuilder(this, table) }
  rpc(fn: string, args: Row = {}) {
    const run = async () => {
      const db = this.db
      const me = this.user()?.id
      const now = new Date().toISOString()
      const ins = (table: string, row: Row) => {
        const r = { ...(COLUMN_DEFAULTS[table] ?? {}), ...row }
        r.id ??= uuid()
        r.created_at ??= now
        if (!TABLES_WITHOUT_UPDATED_AT.has(table)) r.updated_at ??= now
        db[table] ??= []
        db[table].push(r)
        this.emit(table, 'INSERT', r, null)
        return r
      }
      switch (fn) {
        case 'is_member': return db.workspace_members.some((m) => m.workspace_id === args.ws && m.user_id === me)
        case 'create_workspace': {
          const ws = ins('workspaces', { name: args.p_name, slug: args.p_slug, owner_id: me })
          ins('workspace_members', { workspace_id: ws.id, user_id: me, role: 'owner', joined_at: now })
          const c = ins('conversations', { workspace_id: ws.id, type: 'channel', name: 'general', created_by: me })
          ins('conversation_members', { conversation_id: c.id, user_id: me, role: 'owner', joined_at: now, last_read_at: now })
          this.persist()
          return ws
        }
        case 'open_dm': {
          const found = db.conversations.find((c) => c.workspace_id === args.p_workspace && c.type === 'dm'
            && db.conversation_members.some((m) => m.conversation_id === c.id && m.user_id === me)
            && db.conversation_members.some((m) => m.conversation_id === c.id && m.user_id === args.p_other))
          if (found) return found.id
          const c = ins('conversations', { workspace_id: args.p_workspace, type: 'dm', is_private: true, created_by: me })
          ;[me, args.p_other].forEach((u) => ins('conversation_members', { conversation_id: c.id, user_id: u, joined_at: now, last_read_at: now }))
          this.persist()
          return c.id
        }
        case 'accept_invitation':
          throw new Error('Les invitations ne sont pas disponibles en mode démo')
        default: return null
      }
    }
    const promise = run().then((data) => ({ data, error: null as any })).catch((e) => ({ data: null, error: { message: e?.message ?? 'rpc error' } as any }))
    const thenable: any = {
      then: (a: any, b: any) => promise.then(a, b),
      single: () => promise,
      maybeSingle: () => promise,
    }
    return thenable
  }

  channel(name: string) { return new MockChannel(this, name) }
  removeChannel(ch: MockChannel) { return ch.unsubscribe() }
  removeAllChannels() { this.channels.clear(); return Promise.resolve([]) }

  storage = {
    from: (bucket: string) => ({
      upload: async (path: string, file: Blob | File) => {
        const dataUrl = await blobToDataUrl(file)
        this.files.set(`${bucket}/${path}`, dataUrl)
        try { if (typeof window !== 'undefined') window.sessionStorage.setItem(`flow-demo-file:${bucket}/${path}`, dataUrl) } catch {}
        return { data: { path }, error: null }
      },
      getPublicUrl: (path: string) => ({ data: { publicUrl: this.fileUrl(bucket, path) } }),
      createSignedUrl: async (path: string) => ({ data: { signedUrl: this.fileUrl(bucket, path) }, error: null }),
      download: async (path: string) => {
        const url = this.fileUrl(bucket, path)
        if (!url) return { data: null, error: { message: 'Not found' } }
        const blob = await (await fetch(url)).blob()
        return { data: blob, error: null }
      },
      remove: async (paths: string[]) => {
        paths.forEach((p) => this.files.delete(`${bucket}/${p}`))
        return { data: [], error: null }
      },
    }),
  }
  private fileUrl(bucket: string, path: string) {
    const key = `${bucket}/${path}`
    let url = this.files.get(key)
    if (!url && typeof window !== 'undefined') {
      try { url = window.sessionStorage.getItem(`flow-demo-file:${key}`) ?? undefined } catch {}
    }
    return url ?? ''
  }

  // internals used by builder/channels
  emit(table: string, event: string, newRow: Row | null, oldRow: Row | null) {
    // async, like a real websocket
    setTimeout(() => this.channels.forEach((ch) => ch.deliverChange(table, event, newRow, oldRow)), 0)
  }
  broadcast(from: MockChannel, event: string, payload: any) {
    setTimeout(() => {
      this.channels.forEach((ch) => { if (ch !== from && ch.name === from.name) ch.deliverBroadcast(event, payload) })
    }, 0)
  }

  // ── relation resolution ──
  projectRows(table: string, rows: Row[], items: SelItem[]): Row[] {
    return rows.map((row) => this.projectRow(table, row, items))
  }

  private projectRow(table: string, row: Row, items: SelItem[]): Row {
    const out: Row = {}
    for (const it of items) {
      if (it.kind === 'col') {
        if (it.name === '*') Object.assign(out, clone(row))
        else out[it.name] = clone(row[it.name])
      } else {
        const rel = this.resolveRel(table, row, it)
        if (it.items.length === 1 && it.items[0].kind === 'col' && (it.items[0] as any).name === 'count') {
          out[it.alias] = [{ count: Array.isArray(rel) ? rel.length : rel ? 1 : 0 }]
        } else if (Array.isArray(rel)) {
          out[it.alias] = this.projectRows(it.table, rel, it.items)
        } else {
          out[it.alias] = rel ? this.projectRow(it.table, rel, it.items) : null
        }
      }
    }
    return out
  }

  private fkColumn(parentTable: string, row: Row, rel: Extract<SelItem, { kind: 'rel' }>): string | null {
    if (rel.hint?.endsWith('_fkey')) {
      let col = rel.hint.slice(0, -'_fkey'.length)
      col = col.startsWith(parentTable + '_') ? col.slice(parentTable.length + 1) : col.replace(/^[a-z_]+?_(?=[a-z]+_id$)/, '')
      if (col in row) return col
    }
    const candidates = [`${rel.alias}_id`, `${singular(rel.table)}_id`]
    if (rel.table === 'profiles') candidates.push('user_id', 'created_by', 'owner_id', 'assignee_id')
    for (const c of candidates) if (c in row) return c
    return null
  }

  private resolveRel(parentTable: string, row: Row, rel: Extract<SelItem, { kind: 'rel' }>): Row[] | Row | null {
    const target = this.db[rel.table] ?? []
    const col = this.fkColumn(parentTable, row, rel)
    if (col) return target.find((t) => t.id === row[col]) ?? null
    // one-to-many: child holds FK to parent
    const childCol = `${singular(parentTable)}_id`
    return target.filter((t) => t[childCol] === row.id)
  }

  filterInner(table: string, rows: Row[], items: SelItem[]): Row[] {
    const inner = items.filter((i): i is Extract<SelItem, { kind: 'rel' }> => i.kind === 'rel' && i.inner)
    return rows.filter((row) =>
      inner.every((rel) => {
        const r = this.resolveRel(table, row, rel)
        return Array.isArray(r) ? r.length > 0 : !!r
      }),
    )
  }
}

function blobToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function createMockClient(db: DemoDB, opts?: MockClientOptions) {
  return new MockClient(db, opts)
}
