import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/supabase/server'
import { hashKey, sameHash } from '@/lib/api/keys'
import { ALL_SCOPES, KEY_PREFIX, type StoredKey } from '@/lib/api/scopes'
import { docToMarkdown } from '@/lib/api/md'
import { notifyUsers } from '@/lib/api/notify'
import { ALERT_TYPES, cleanChannel, emitAlert, routesFrom, type AlertType, type Severity } from '@/lib/api/alerts'
import { safePath } from '@/lib/utils'
import { mdToDoc } from '@/lib/demo/kalimat-data'
import { CAPTURE_KINDS, CAPTURE_STATUSES, MAX_CAPTURE_NOTE, cleanCaptureUrl, currentProjectOf, firstUrl, inferCaptureKind, projectLabels, resolveProjects, wantsAi } from '@/lib/captures'
import { projectPath, projectTree } from '@/lib/projects'

export const runtime = 'nodejs'
export const maxDuration = 30

type Admin = ReturnType<typeof getAdminDb>
type Ctx = { a: Admin; ws: { id: string; name: string; slug: string; settings: unknown }; key: StoredKey; url: URL }
type Row = Record<string, unknown>

const MAX_FILE = 25 * 1024 * 1024
const MAX_INLINE = 4 * 1024 * 1024 // Vercel functions accept ~4.5 MB bodies; larger files use /files/upload-url
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'cache-control': 'no-store' } })
const fail = (status: number, code: string, message: string) => json({ error: { code, message } }, status)

// ── rate limit: 120 requests / minute / key (best effort, per instance) ──
const hits = new Map<string, number[]>()
function limited(id: string) {
  const now = Date.now()
  const list = (hits.get(id) ?? []).filter((t) => now - t < 60_000)
  list.push(now); hits.set(id, list)
  return list.length > 120
}

// ── resources ──
// Column types: s string · n number · b boolean · d date/null · sa string[] · ua uuid[] of members · ia:<table> uuid[] of rows of this workspace · j object · e:a|b enum · u:<table> id of a row of this workspace
type Spec = { table: string; scope: string; soft: boolean; cols: Record<string, string>; search?: string; filters?: string[]; label: string }
const RES: Record<string, Spec> = {
  projects: { table: 'projects', scope: 'projects', soft: true, label: 'project', search: 'name', filters: ['status'], cols: { name: 's', description: 's', color: 's', icon: 's', status: 's' } },
  tasks: {
    table: 'tasks', scope: 'tasks', soft: true, label: 'task', search: 'title', filters: ['status', 'priority', 'project_id', 'assignee_id'],
    cols: { title: 's', description: 's', status: 'e:backlog|todo|in_progress|in_review|done|cancelled', priority: 'e:low|medium|high|urgent', project_id: 'u:projects', parent_id: 'u:tasks', assignee_id: 'u:@members', due_date: 'd', tags: 'sa', estimate_minutes: 'n', position: 'n' },
  },
  notes: {
    table: 'notes', scope: 'notes', soft: true, label: 'note', search: 'title', filters: ['kind', 'project_id'],
    cols: { title: 's', kind: 'e:note|doc|wiki', icon: 's', project_id: 'u:projects', parent_id: 'u:notes', tags: 'sa', is_pinned: 'b', content: 'j' },
  },
  events: { table: 'events', scope: 'events', soft: true, label: 'event', search: 'title', filters: [], cols: { title: 's', description: 's', start_at: 'd', end_at: 'd', all_day: 'b', color: 's', location: 's', attendees: 'ua', task_id: 'u:tasks' } },
  goals: { table: 'goals', scope: 'goals', soft: true, label: 'goal', search: 'title', filters: ['status'], cols: { title: 's', description: 's', target: 'n', current: 'n', unit: 's', status: 's', color: 's', due_date: 'd' } },
  'key-results': { table: 'key_results', scope: 'goals', soft: false, label: 'key_result', search: 'title', filters: ['goal_id'], cols: { goal_id: 'u:goals', title: 's', target: 'n', current: 'n', unit: 's' } },
  contacts: { table: 'crm_contacts', scope: 'crm', soft: true, label: 'contact', search: 'name', filters: ['status'], cols: { name: 's', email: 's', phone: 's', company: 's', position: 's', status: 's', tags: 'sa', notes: 's' } },
  deals: { table: 'crm_deals', scope: 'crm', soft: true, label: 'deal', search: 'title', filters: ['stage', 'contact_id'], cols: { contact_id: 'u:crm_contacts', title: 's', value: 'n', currency: 's', stage: 's', probability: 'n', close_date: 'd' } },
  // Captures: created through captures() below (link, file or text); read, updated and deleted through the generic CRUD.
  captures: {
    table: 'captures', scope: 'captures', soft: true, label: 'capture', search: 'title', filters: ['status', 'kind', 'project_id', 'ai_analysis'],
    cols: { project_id: 'u:projects', kind: `e:${CAPTURE_KINDS.join('|')}`, url: 's', file_id: 'u:files', title: 's', note: 's', ai_analysis: 'b', status: `e:${CAPTURE_STATUSES.join('|')}`, summary: 's', knowledge: 's', task_ids: 'ia:tasks', obsidian_note: 's' },
  },
}
const REQUIRED: Record<string, string[]> = { projects: ['name'], tasks: ['title'], notes: ['title'], events: ['title', 'start_at', 'end_at'], goals: ['title', 'target'], 'key-results': ['goal_id', 'title', 'target'], contacts: ['name'], deals: ['title'] }

class Bad extends Error { constructor(public code: string, msg: string, public status = 400) { super(msg) } }

async function refOk(ctx: Ctx, table: string, id: string) {
  if (table === '@members') {
    const { data } = await ctx.a.from('workspace_members').select('user_id').eq('workspace_id', ctx.ws.id).eq('user_id', id).maybeSingle()
    return !!data
  }
  const { data } = await ctx.a.from(table).select('id').eq('id', id).eq('workspace_id', ctx.ws.id).maybeSingle()
  return !!data
}

async function clean(ctx: Ctx, spec: Spec, body: Row, partial: boolean): Promise<Row> {
  const out: Row = {}
  for (const [k, ty] of Object.entries(spec.cols)) {
    if (!(k in body)) continue
    const v = body[k]
    if (v === null) { if (['s', 'd', 'j'].includes(ty) || ty.startsWith('u:') || ty.startsWith('e:')) { out[k] = null; continue } throw new Bad('invalid_field', `${k} cannot be null`) }
    if (ty === 's') { if (typeof v !== 'string' || v.length > 50_000) throw new Bad('invalid_field', `${k} must be a string`); out[k] = v }
    else if (ty === 'n') { if (typeof v !== 'number' || !Number.isFinite(v)) throw new Bad('invalid_field', `${k} must be a number`); out[k] = v }
    else if (ty === 'b') { if (typeof v !== 'boolean') throw new Bad('invalid_field', `${k} must be a boolean`); out[k] = v }
    else if (ty === 'd') { if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) throw new Bad('invalid_field', `${k} must be an ISO-8601 date`); out[k] = v }
    else if (ty === 'sa') { if (!Array.isArray(v) || v.length > 50 || v.some((x) => typeof x !== 'string' || x.length > 100)) throw new Bad('invalid_field', `${k} must be an array of strings`); out[k] = v }
    else if (ty === 'ua') { if (!Array.isArray(v) || v.length > 100 || v.some((x) => typeof x !== 'string' || !UUID.test(x))) throw new Bad('invalid_field', `${k} must be an array of ids`); for (const id of v as string[]) if (!(await refOk(ctx, '@members', id))) throw new Bad('invalid_reference', `${k}: unknown member`); out[k] = v }
    else if (ty.startsWith('ia:')) { if (!Array.isArray(v) || v.length > 50 || v.some((x) => typeof x !== 'string' || !UUID.test(x))) throw new Bad('invalid_field', `${k} must be an array of ids`); for (const id of v as string[]) if (!(await refOk(ctx, ty.slice(3), id))) throw new Bad('invalid_reference', `${k}: not found in this workspace`); out[k] = v }
    else if (ty === 'j') { if (typeof v !== 'object') throw new Bad('invalid_field', `${k} must be an object`); out[k] = v }
    else if (ty.startsWith('e:')) { if (typeof v !== 'string' || !ty.slice(2).split('|').includes(v)) throw new Bad('invalid_field', `${k} must be one of ${ty.slice(2).replace(/\|/g, ', ')}`); out[k] = v }
    else if (ty.startsWith('u:')) { if (typeof v !== 'string' || !UUID.test(v) || !(await refOk(ctx, ty.slice(2), v))) throw new Bad('invalid_reference', `${k}: not found in this workspace`); out[k] = v }
  }
  return out
}

const noteOut = (r: Row, withContent: boolean): Row => { const { content, ...rest } = r; return withContent ? { ...rest, markdown: docToMarkdown(content), content } : rest }

async function log(ctx: Ctx, action: string, entity: string, id?: string) {
  await ctx.a.from('activity_logs').insert({ workspace_id: ctx.ws.id, user_id: ctx.key.bot_id, action, entity_type: entity, entity_id: id ?? null, meta: { via: 'api', key: ctx.key.name } })
}

// ── generic CRUD ──
async function crud(ctx: Ctx, method: string, name: string, id: string | undefined, spec: Spec, body: Row) {
  const write = method !== 'GET'
  if (!ctx.key.scopes.includes(`${spec.scope}:${write ? 'write' : 'read'}`)) return fail(403, 'insufficient_scope', `Missing scope ${spec.scope}:${write ? 'write' : 'read'}`)
  const t = spec.table
  if (id && !UUID.test(id)) return fail(400, 'invalid_id', 'Invalid id')

  if (method === 'GET' && !id) {
    const p = ctx.url.searchParams
    const limit = Math.min(Math.max(Number(p.get('limit')) || 50, 1), 200), offset = Math.max(Number(p.get('offset')) || 0, 0)
    let q = ctx.a.from(t).select('*', { count: 'exact' }).eq('workspace_id', ctx.ws.id)
    if (spec.soft) q = q.is('deleted_at', null)
    for (const f of spec.filters ?? []) { const v = p.get(f); if (v) q = q.eq(f, v) }
    const s = p.get('q'); if (s && spec.search) q = q.ilike(spec.search, `%${s.replace(/[%,()]/g, ' ')}%`)
    const since = p.get('updated_since'); if (since && !Number.isNaN(Date.parse(since)) && t !== 'key_results') q = q.gte('updated_at', since)
    const { data, error, count } = await q.order('created_at', { ascending: false }).range(offset, offset + limit - 1)
    if (error) return fail(500, 'db_error', 'Query failed')
    const rows = (data ?? []) as Row[]
    return json({ data: name === 'notes' ? rows.map((r) => noteOut(r, p.get('include') === 'content')) : rows, count: count ?? rows.length, limit, offset })
  }
  if (method === 'GET') {
    let q = ctx.a.from(t).select('*').eq('id', id!).eq('workspace_id', ctx.ws.id)
    if (spec.soft) q = q.is('deleted_at', null)
    const { data } = await q.maybeSingle()
    if (!data) return fail(404, 'not_found', `${spec.label} not found`)
    return json({ data: name === 'notes' ? noteOut(data as Row, true) : data })
  }

  if (method === 'POST' && !id) {
    for (const f of REQUIRED[name] ?? []) if (body[f] === undefined && !(name === 'notes' && f === 'content')) throw new Bad('missing_field', `${f} is required`)
    if (name === 'notes' && typeof body.markdown === 'string') body = { ...body, content: mdToDoc(body.markdown) }
    const row = await clean(ctx, spec, body, false)
    if (name === 'tasks') row.completed_at = row.status === 'done' ? new Date().toISOString() : null
    if (name === 'notes' && !row.content) row.content = { type: 'doc', content: [] }
    if (t !== 'key_results') row.created_by = ctx.key.bot_id
    if (t === 'goals' && row.current === undefined) row.current = 0
    const { data, error } = await ctx.a.from(t).insert({ ...row, workspace_id: ctx.ws.id }).select('*').single()
    if (error) return fail(400, 'invalid', error.message.slice(0, 200))
    await log(ctx, `${spec.label}.create`, spec.label, (data as Row).id as string)
    return json({ data: name === 'notes' ? noteOut(data as Row, true) : data }, 201)
  }
  if (method === 'PATCH' && id) {
    if (name === 'notes' && typeof body.markdown === 'string') body = { ...body, content: mdToDoc(body.markdown) }
    const row = await clean(ctx, spec, body, true)
    if (!Object.keys(row).length) throw new Bad('empty', 'Nothing to update')
    if (name === 'tasks' && 'status' in row) row.completed_at = row.status === 'done' ? new Date().toISOString() : null
    if (name === 'captures' && 'status' in row) row.processed_at = row.status === 'vu' ? new Date().toISOString() : null
    if (name === 'captures' && 'url' in row && row.url !== null && !cleanCaptureUrl(row.url)) throw new Bad('invalid_field', 'url must be an http(s) link')
    if (t !== 'key_results') row.updated_at = new Date().toISOString()
    const { data: before } = await ctx.a.from(t).select('*').eq('id', id).eq('workspace_id', ctx.ws.id).maybeSingle()
    let q = ctx.a.from(t).update(row).eq('id', id).eq('workspace_id', ctx.ws.id)
    if (spec.soft) q = q.is('deleted_at', null)
    const { data, error } = await q.select('*').maybeSingle()
    if (error) return fail(400, 'invalid', error.message.slice(0, 200))
    if (!data) return fail(404, 'not_found', `${spec.label} not found`)
    await log(ctx, `${spec.label}.update`, spec.label, id)
    if (body.silent !== true && ctx.url.searchParams.get('silent') !== '1') await autoAlerts(ctx, name, before as Row | null, data as Row)
    return json({ data: name === 'notes' ? noteOut(data as Row, true) : data })
  }
  if (method === 'DELETE' && id) {
    // Soft delete: goes to the Trash and can be restored from the app.
    const q = spec.soft ? ctx.a.from(t).update({ deleted_at: new Date().toISOString() }).eq('id', id).eq('workspace_id', ctx.ws.id).is('deleted_at', null) : ctx.a.from(t).delete().eq('id', id).eq('workspace_id', ctx.ws.id)
    const { data, error } = await q.select('id')
    if (error) return fail(400, 'invalid', error.message.slice(0, 200))
    if (!data?.length) return fail(404, 'not_found', `${spec.label} not found`)
    await log(ctx, `${spec.label}.delete`, spec.label, id)
    return json({ ok: true })
  }
  return fail(405, 'method_not_allowed', 'Method not allowed')
}

// ── automatic alerts: a task/goal/key result that just crossed the finish line ──
async function autoAlerts(ctx: Ctx, name: string, before: Row | null, after: Row) {
  try {
    const emit = (type: AlertType, title: string, body?: string) => emitAlert(ctx.a, ctx.ws, ctx.key, { type, title, body })
    if (name === 'tasks' && before?.status !== 'done' && after.status === 'done') {
      await emit('task.done', String(after.title))
      const pid = after.project_id as string | null
      if (pid) {
        const { data: open } = await ctx.a.from('tasks').select('id', { count: 'exact', head: false }).eq('workspace_id', ctx.ws.id).eq('project_id', pid).is('deleted_at', null).not('status', 'in', '(done,cancelled)').limit(1)
        if (!open?.length) {
          const { data: p } = await ctx.a.from('projects').select('name').eq('id', pid).maybeSingle()
          await emit('group.done', p?.name ? `Projet « ${p.name} » : toutes les tâches sont terminées` : 'Toutes les tâches du projet sont terminées')
        }
      }
    } else if ((name === 'goals' || name === 'key-results') && Number(after.target) > 0 && Number(before?.current ?? 0) < Number(after.target) && Number(after.current) >= Number(after.target)) {
      await emit('step.done', String(after.title), `${after.current}/${after.target}${after.unit ? ` ${after.unit}` : ''}`)
    }
  } catch { /* alerts are best effort: never fail the write */ }
}

// ── messages ──
async function resolveChannel(ctx: Ctx, ref: unknown) {
  if (typeof ref !== 'string' || !ref) throw new Bad('missing_field', 'channel is required (id or name)')
  const name = ref.replace(/^#/, '')
  let q = ctx.a.from('conversations').select('id,name,type,is_private').eq('workspace_id', ctx.ws.id).in('type', ['channel', 'group'])
  q = UUID.test(name) ? q.eq('id', name) : q.ilike('name', name.replace(/[%_]/g, ''))
  const { data } = await q.limit(1)
  const c = data?.[0]
  if (!c) throw new Bad('not_found', 'Channel not found', 404)
  if (c.is_private) {
    const { data: m } = await ctx.a.from('conversation_members').select('id').eq('conversation_id', c.id).eq('user_id', ctx.key.bot_id).maybeSingle()
    if (!m) throw new Bad('forbidden', 'Private channel: add the API bot to it first', 403)
  }
  return c as { id: string; name: string | null }
}

async function messages(ctx: Ctx, method: string, id: string | undefined, body: Row) {
  const need = method === 'GET' ? 'messages:read' : 'messages:write'
  if (!ctx.key.scopes.includes(need)) return fail(403, 'insufficient_scope', `Missing scope ${need}`)
  const p = ctx.url.searchParams
  if (method === 'GET') {
    const c = await resolveChannel(ctx, p.get('channel'))
    const limit = Math.min(Math.max(Number(p.get('limit')) || 50, 1), 200)
    let q = ctx.a.from('messages').select('id,user_id,content,kind,attachments,parent_id,is_pinned,is_edited,created_at,author:profiles(full_name)').eq('conversation_id', c.id).is('deleted_at', null)
    const before = p.get('before'); if (before && !Number.isNaN(Date.parse(before))) q = q.lt('created_at', before)
    const { data, error } = await q.order('created_at', { ascending: false }).limit(limit)
    if (error) return fail(500, 'db_error', 'Query failed')
    return json({ data: (data ?? []).reverse(), channel: { id: c.id, name: c.name } })
  }
  if (method === 'POST' && !id) {
    const c = await resolveChannel(ctx, body.channel)
    const text = typeof body.text === 'string' ? body.text.trim() : ''
    if (text.length > 8000) throw new Bad('invalid_field', 'text is too long (8000 max)')
    const fileIds = Array.isArray(body.file_ids) ? (body.file_ids as unknown[]).filter((x): x is string => typeof x === 'string' && UUID.test(x)).slice(0, 10) : []
    let attachments: Row[] = []
    if (fileIds.length) {
      const { data: fs } = await ctx.a.from('files').select('id,name,size,mime_type,storage_path').eq('workspace_id', ctx.ws.id).is('deleted_at', null).in('id', fileIds)
      attachments = (fs ?? []).map((f) => {
        const mime = (f.mime_type as string | null) ?? ''
        return { type: mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'file', path: f.storage_path, name: f.name, size: f.size, mime }
      })
    }
    if (!text && !attachments.length) throw new Bad('missing_field', 'text or file_ids is required')
    let parent: string | null = null
    if (typeof body.reply_to === 'string') {
      const { data: pm } = await ctx.a.from('messages').select('id').eq('id', body.reply_to).eq('conversation_id', c.id).maybeSingle()
      if (!pm) throw new Bad('invalid_reference', 'reply_to: message not found')
      parent = pm.id
    }
    const { data, error } = await ctx.a.from('messages').insert({ conversation_id: c.id, user_id: ctx.key.bot_id, kind: attachments.length ? 'file' : 'text', content: text || null, attachments, parent_id: parent }).select('id,created_at').single()
    if (error || !data) return fail(400, 'invalid', error?.message.slice(0, 200) ?? 'failed')
    if (body.notify !== false) {
      const { data: ms } = await ctx.a.from('workspace_members').select('user_id,profile:profiles(preferences)').eq('workspace_id', ctx.ws.id).neq('user_id', ctx.key.bot_id)
      const humans = (ms ?? []).filter((m) => !((m.profile as { preferences?: { bot?: boolean } } | null)?.preferences?.bot)).map((m) => m.user_id as string)
      void notifyUsers(ctx.ws.id, humans, { type: 'message', title: `${ctx.key.name} · #${c.name ?? 'chat'}`, body: text || attachments.map((a) => a.name).join(', '), url: `/app/${ctx.ws.slug}/messages/${c.id}` })
    }
    await log(ctx, 'message.create', 'message', data.id)
    return json({ data }, 201)
  }
  if ((method === 'PATCH' || method === 'DELETE') && id && UUID.test(id)) {
    const { data: m } = await ctx.a.from('messages').select('id,user_id,conversation_id').eq('id', id).is('deleted_at', null).maybeSingle()
    const { data: conv } = m ? await ctx.a.from('conversations').select('workspace_id').eq('id', m.conversation_id).maybeSingle() : { data: null }
    if (!m || conv?.workspace_id !== ctx.ws.id) return fail(404, 'not_found', 'message not found')
    if (m.user_id !== ctx.key.bot_id) return fail(403, 'forbidden', 'A key can only edit or delete its own messages')
    if (method === 'DELETE') { await ctx.a.from('messages').update({ deleted_at: new Date().toISOString(), content: null, attachments: [] }).eq('id', id); return json({ ok: true }) }
    const text = typeof body.text === 'string' ? body.text.trim() : ''
    if (!text || text.length > 8000) throw new Bad('invalid_field', 'text is required (8000 max)')
    await ctx.a.from('messages').update({ content: text, is_edited: true, updated_at: new Date().toISOString() }).eq('id', id)
    return json({ ok: true })
  }
  return fail(405, 'method_not_allowed', 'Method not allowed')
}

// ── files ──
const safeName = (n: string) => n.replace(/[^\w.\-]+/g, '_').slice(0, 120) || 'file'
const folderOf = (v: unknown) => { const f = typeof v === 'string' && v.trim() ? v.trim() : '/API'; return (f.startsWith('/') ? f : `/${f}`).slice(0, 120) }

async function files(ctx: Ctx, req: Request, method: string, id: string | undefined, sub: string | undefined, body: Row) {
  const need = method === 'GET' ? 'files:read' : 'files:write'
  if (!ctx.key.scopes.includes(need)) return fail(403, 'insufficient_scope', `Missing scope ${need}`)
  const bucket = ctx.a.storage.from('files')
  const p = ctx.url.searchParams

  if (method === 'GET' && !id) {
    const limit = Math.min(Math.max(Number(p.get('limit')) || 50, 1), 200)
    let q = ctx.a.from('files').select('id,folder,name,size,mime_type,created_at,uploaded_by').eq('workspace_id', ctx.ws.id).is('deleted_at', null)
    const folder = p.get('folder'); if (folder) q = q.eq('folder', folderOf(folder))
    const s = p.get('q'); if (s) q = q.ilike('name', `%${s.replace(/[%,()]/g, ' ')}%`)
    const { data, error } = await q.order('created_at', { ascending: false }).limit(limit)
    if (error) return fail(500, 'db_error', 'Query failed')
    return json({ data })
  }
  if (method === 'GET' && id && UUID.test(id)) {
    const { data: f } = await ctx.a.from('files').select('id,folder,name,size,mime_type,storage_path,created_at').eq('id', id).eq('workspace_id', ctx.ws.id).is('deleted_at', null).maybeSingle()
    if (!f) return fail(404, 'not_found', 'file not found')
    const { data: s } = await bucket.createSignedUrl(f.storage_path, 600)
    const { storage_path: _p, ...meta } = f
    const out: Row = { ...meta, download_url: s?.signedUrl ?? null, download_url_expires_in: 600 }
    if (p.get('content') === '1' && (f.size ?? 0) <= 512 * 1024 && /^text\/|json|xml|markdown/.test(f.mime_type ?? '')) {
      const { data: blob } = await bucket.download(f.storage_path)
      if (blob) out.content = await blob.text()
    }
    return json({ data: out })
  }
  if (method === 'DELETE' && id && UUID.test(id)) {
    const { data } = await ctx.a.from('files').update({ deleted_at: new Date().toISOString() }).eq('id', id).eq('workspace_id', ctx.ws.id).is('deleted_at', null).select('id')
    if (!data?.length) return fail(404, 'not_found', 'file not found')
    await log(ctx, 'file.delete', 'file', id)
    return json({ ok: true })
  }
  // Big files: 1) ask for a signed upload URL, 2) PUT the bytes to it, 3) register the file.
  if (method === 'POST' && id === 'upload-url') {
    const name = typeof body.name === 'string' ? body.name : ''
    const size = Number(body.size)
    if (!name) throw new Bad('missing_field', 'name is required')
    if (!Number.isFinite(size) || size <= 0 || size > MAX_FILE) throw new Bad('too_large', `size is required and must be at most ${MAX_FILE} bytes (25 MB)`, 413)
    const path = `${ctx.ws.id}/api/${crypto.randomUUID().slice(0, 8)}-${safeName(name)}`
    const { data, error } = await bucket.createSignedUploadUrl(path)
    if (error || !data) return fail(500, 'storage_error', 'Could not create upload URL')
    return json({ data: { path, upload_url: data.signedUrl, method: 'PUT', headers: { 'content-type': typeof body.mime === 'string' ? body.mime : 'application/octet-stream' }, then: 'POST /api/v1/files/register {path,name,folder,mime}' } })
  }
  if (method === 'POST' && id === 'register') {
    const path = typeof body.path === 'string' ? body.path : ''
    const name = typeof body.name === 'string' ? body.name : ''
    if (!path.startsWith(`${ctx.ws.id}/api/`) || path.includes('..') || !name) throw new Bad('invalid_field', 'path and name are required (path from upload-url)')
    const { data: info } = await bucket.info(path)
    if (!info) throw new Bad('not_uploaded', 'Nothing uploaded at this path yet', 409)
    const { data: row, error } = await ctx.a.from('files').insert({ workspace_id: ctx.ws.id, folder: folderOf(body.folder), name: name.slice(0, 200), size: info.size ?? null, mime_type: typeof body.mime === 'string' ? body.mime : info.contentType ?? null, storage_path: path, uploaded_by: ctx.key.bot_id }).select('id,folder,name,size,mime_type,created_at').single()
    if (error) return fail(400, 'invalid', error.message.slice(0, 200))
    await log(ctx, 'file.create', 'file', row.id)
    return json({ data: row }, 201)
  }
  // Small files (≤ 4 MB): multipart/form-data (field "file", optional "folder") or JSON {name, text | base64, mime, folder}
  if (method === 'POST' && !id) {
    let bytes: Uint8Array, name: string, mime: string, folder: string
    if ((req.headers.get('content-type') ?? '').startsWith('multipart/form-data')) {
      const fd = await req.formData()
      const f = fd.get('file')
      if (!(f instanceof File)) throw new Bad('missing_field', 'file is required')
      bytes = new Uint8Array(await f.arrayBuffer()); name = f.name; mime = f.type || 'application/octet-stream'; folder = folderOf(fd.get('folder'))
    } else {
      name = typeof body.name === 'string' ? body.name : ''
      if (!name) throw new Bad('missing_field', 'name is required')
      if (typeof body.text === 'string') bytes = new TextEncoder().encode(body.text)
      else if (typeof body.base64 === 'string') bytes = Uint8Array.from(Buffer.from(body.base64, 'base64'))
      else throw new Bad('missing_field', 'text or base64 is required')
      mime = typeof body.mime === 'string' ? body.mime : /\.md$/i.test(name) ? 'text/markdown' : /\.json$/i.test(name) ? 'application/json' : typeof body.text === 'string' ? 'text/plain' : 'application/octet-stream'
      folder = folderOf(body.folder)
    }
    if (bytes.length > MAX_INLINE) throw new Bad('too_large', 'Over 4 MB: use POST /files/upload-url (up to 25 MB)', 413)
    if (!bytes.length) throw new Bad('invalid_field', 'empty file')
    const path = `${ctx.ws.id}/api/${crypto.randomUUID().slice(0, 8)}-${safeName(name)}`
    const up = await bucket.upload(path, bytes, { contentType: mime, upsert: false })
    if (up.error) return fail(500, 'storage_error', 'Upload failed')
    const { data: row, error } = await ctx.a.from('files').insert({ workspace_id: ctx.ws.id, folder, name: name.slice(0, 200), size: bytes.length, mime_type: mime, storage_path: path, uploaded_by: ctx.key.bot_id }).select('id,folder,name,size,mime_type,created_at').single()
    if (error) return fail(400, 'invalid', error.message.slice(0, 200))
    await log(ctx, 'file.create', 'file', row.id)
    return json({ data: row }, 201)
  }
  return fail(405, 'method_not_allowed', 'Method not allowed')
}

// ── captures ──
// What a share sheet sends: a link, a file, a text, or a mix. Never notifies the team: a capture is a personal inbox item.
const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '')

async function captureFile(ctx: Ctx, bytes: Uint8Array, name: string, mime: string): Promise<{ id: string; mime: string }> {
  if (bytes.length > MAX_INLINE) throw new Bad('too_large', 'Over 4 MB: use POST /captures/upload-url (up to 25 MB), then POST /captures {upload_path}', 413)
  if (!bytes.length) throw new Bad('invalid_field', 'empty file')
  const path = `${ctx.ws.id}/captures/${crypto.randomUUID().slice(0, 8)}-${safeName(name)}`
  const up = await ctx.a.storage.from('files').upload(path, bytes, { contentType: mime, upsert: false })
  if (up.error) throw new Bad('storage_error', 'Upload failed', 500)
  return registerCaptureFile(ctx, path, name, mime, bytes.length)
}

async function registerCaptureFile(ctx: Ctx, path: string, name: string, mime: string, size: number | null): Promise<{ id: string; mime: string }> {
  const { data, error } = await ctx.a.from('files').insert({ workspace_id: ctx.ws.id, folder: '/Captures', name: name.slice(0, 200), size, mime_type: mime, storage_path: path, uploaded_by: ctx.key.bot_id }).select('id').single()
  if (error || !data) throw new Bad('invalid', error?.message.slice(0, 200) ?? 'Could not save the file')
  return { id: data.id as string, mime }
}

/** Projets de l'espace en arbre (« Kalimat › Kalimat 2.0 ») et projet en cours de la personne qui a créé la clé. */
async function captureProjects(ctx: Ctx) {
  let rows = (await ctx.a.from('projects').select('id,name,parent_id').eq('workspace_id', ctx.ws.id).is('deleted_at', null).neq('status', 'archived')).data as { id: string; name: string; parent_id?: string | null }[] | null
  // base pas encore à jour (pas de colonne parent_id) : projets à plat
  if (!rows) rows = ((await ctx.a.from('projects').select('id,name').eq('workspace_id', ctx.ws.id).is('deleted_at', null).neq('status', 'archived')).data ?? []) as { id: string; name: string }[]
  const tree = projectTree(rows).map(({ project }) => ({ id: project.id, name: project.name, path: projectPath(project.id, rows) }))
  const { data: owner } = await ctx.a.from('profiles').select('preferences').eq('id', ctx.key.created_by).maybeSingle()
  const cur = currentProjectOf(owner?.preferences, ctx.ws.id)
  const current = tree.find((p) => p.id === cur) ?? null
  return { tree, current }
}

async function captures(ctx: Ctx, req: Request, method: string, id: string | undefined, body: Row) {
  const spec = RES.captures
  // GET /captures/projects : libellés pour le raccourci iPhone (projet en cours d'abord), lisible avec la seule clé captures
  if (method === 'GET' && id === 'projects') {
    if (!ctx.key.scopes.includes('captures:write') && !ctx.key.scopes.includes('captures:read')) return fail(403, 'insufficient_scope', 'Missing scope captures:write')
    const { tree, current } = await captureProjects(ctx)
    return json({ data: projectLabels(tree, current), projects: tree.map(({ id: pid, path }) => ({ id: pid, label: path })), current: current?.id ?? null })
  }
  // Everything but creation is plain CRUD; reading one capture also returns its file with a download link.
  if (method === 'GET' && id && UUID.test(id)) {
    if (!ctx.key.scopes.includes('captures:read')) return fail(403, 'insufficient_scope', 'Missing scope captures:read')
    const { data } = await ctx.a.from('captures').select('*').eq('id', id).eq('workspace_id', ctx.ws.id).is('deleted_at', null).maybeSingle()
    if (!data) return fail(404, 'not_found', 'capture not found')
    const out: Row = { ...(data as Row), file: null }
    if (data.file_id) {
      const { data: f } = await ctx.a.from('files').select('id,name,size,mime_type,storage_path').eq('id', data.file_id).eq('workspace_id', ctx.ws.id).maybeSingle()
      if (f) {
        const { data: s } = await ctx.a.storage.from('files').createSignedUrl(f.storage_path, 600)
        out.file = { id: f.id, name: f.name, size: f.size, mime_type: f.mime_type, download_url: s?.signedUrl ?? null, download_url_expires_in: 600 }
      }
    }
    return json({ data: out })
  }
  if (method !== 'POST' || (id && id !== 'upload-url')) return await crud(ctx, method, 'captures', id, spec, body)
  if (!ctx.key.scopes.includes('captures:write')) return fail(403, 'insufficient_scope', 'Missing scope captures:write')

  // Big files (a video): 1) ask for a signed upload URL, 2) PUT the bytes to it, 3) POST /captures {upload_path, name, mime}.
  if (id === 'upload-url') {
    const name = str(body.name, 200), size = Number(body.size)
    if (!name) throw new Bad('missing_field', 'name is required')
    if (!Number.isFinite(size) || size <= 0 || size > MAX_FILE) throw new Bad('too_large', `size is required and must be at most ${MAX_FILE} bytes (25 MB)`, 413)
    const path = `${ctx.ws.id}/captures/${crypto.randomUUID().slice(0, 8)}-${safeName(name)}`
    const { data, error } = await ctx.a.storage.from('files').createSignedUploadUrl(path)
    if (error || !data) return fail(500, 'storage_error', 'Could not create upload URL')
    return json({ data: { path, upload_url: data.signedUrl, method: 'PUT', headers: { 'content-type': str(body.mime, 100) || 'application/octet-stream' }, then: 'POST /api/v1/captures {upload_path,name,mime,note?,project_id?,ai_analysis?}' } })
  }

  // One request: JSON {url?, text?, note?, title?, project_id?, project_ids?, projects?, kind?, ai_analysis?, base64?+name, upload_path?+name} or multipart (same fields + "file").
  let fields: Row = body
  let file: { id: string; mime: string } | null = null
  if ((req.headers.get('content-type') ?? '').startsWith('multipart/form-data')) {
    const fd = await req.formData()
    fields = Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === 'string'))
    const f = fd.get('file')
    if (f instanceof File && f.size > 0) file = await captureFile(ctx, new Uint8Array(await f.arrayBuffer()), f.name || 'capture', f.type || 'application/octet-stream')
  } else if (typeof body.base64 === 'string') {
    file = await captureFile(ctx, Uint8Array.from(Buffer.from(body.base64, 'base64')), str(body.name, 200) || 'capture', str(body.mime, 100) || 'application/octet-stream')
  } else if (typeof body.upload_path === 'string') {
    const path = body.upload_path
    if (!path.startsWith(`${ctx.ws.id}/captures/`) || path.includes('..')) throw new Bad('invalid_field', 'upload_path must come from /captures/upload-url')
    const { data: info } = await ctx.a.storage.from('files').info(path)
    if (!info) throw new Bad('not_uploaded', 'Nothing uploaded at this path yet', 409)
    file = await registerCaptureFile(ctx, path, str(body.name, 200) || 'capture', str(body.mime, 100) || info.contentType || 'application/octet-stream', info.size ?? null)
  }

  // The link: given as such, or found inside the shared text ("Regarde ça https://…").
  const text = str(fields.text, MAX_CAPTURE_NOTE)
  let url: string | null = null
  if (typeof fields.url === 'string' && fields.url.trim()) {
    url = cleanCaptureUrl(fields.url)
    if (!url) throw new Bad('invalid_field', 'url must be an http(s) link')
  } else url = cleanCaptureUrl(firstUrl(text))
  const note = str(fields.note, MAX_CAPTURE_NOTE) || (text && text !== url ? text : '')
  if (!url && !file && !note) throw new Bad('missing_field', 'Send at least one of: url, text, note, file')

  const kind = (CAPTURE_KINDS as readonly string[]).includes(String(fields.kind)) ? String(fields.kind) : inferCaptureKind({ url, mime: file?.mime })

  // Projets : project_ids (identifiants) ou projects (libellés du raccourci, une ligne chacun), sinon project_id, sinon le projet en cours.
  const { tree, current } = await captureProjects(ctx)
  let projectIds: string[] = []
  if (Array.isArray(fields.project_ids)) {
    projectIds = [...new Set((fields.project_ids as unknown[]).map(String))]
    if (projectIds.some((pid) => !tree.some((p) => p.id === pid))) throw new Bad('invalid_reference', 'project_ids: not found in this workspace')
  } else if (fields.projects !== undefined && fields.projects !== null && String(fields.projects).trim()) {
    projectIds = resolveProjects(fields.projects, tree, current?.id ?? null)
    // projets envoyés mais aucun reconnu : refuser plutôt que ranger « sans projet » sans rien dire
    if (projectIds.length === 0 && !/^projet (en cours|par défaut)/i.test(String(fields.projects).trim())) throw new Bad('unknown_projects', `Projets inconnus : ${String(fields.projects).slice(0, 200)}. Projets possibles : ${tree.map((p) => p.path).join(', ').slice(0, 600)}`, 422)
  } else if (typeof fields.project_id === 'string' && fields.project_id) {
    if (!UUID.test(fields.project_id) || !tree.some((p) => p.id === fields.project_id)) throw new Bad('invalid_reference', 'project_id: not found in this workspace')
    projectIds = [fields.project_id]
  }
  if (projectIds.length === 0 && current) projectIds = [current.id]
  const projectId = projectIds[0] ?? null

  const { data, error } = await ctx.a.from('captures').insert({ workspace_id: ctx.ws.id, project_id: projectId, project_ids: projectIds, kind, url, file_id: file?.id ?? null, title: str(fields.title, 200) || null, note: note || null, ai_analysis: wantsAi(fields.ai_analysis), created_by: ctx.key.bot_id }).select('*').single()
  if (error || !data) return fail(400, 'invalid', error?.message.slice(0, 200) ?? 'failed')
  await log(ctx, 'capture.create', 'capture', (data as Row).id as string)
  return json({ data }, 201)
}

// ── notifications ──
async function notify(ctx: Ctx, body: Row) {
  if (!ctx.key.scopes.includes('notifications:write')) return fail(403, 'insufficient_scope', 'Missing scope notifications:write')
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) throw new Bad('missing_field', 'title is required')
  const to = body.to ?? 'creator'
  let ids: string[]
  if (to === 'creator') ids = [ctx.key.created_by]
  else if (to === 'all') {
    const { data: ms } = await ctx.a.from('workspace_members').select('user_id,profile:profiles(preferences)').eq('workspace_id', ctx.ws.id)
    ids = (ms ?? []).filter((m) => !((m.profile as { preferences?: { bot?: boolean } } | null)?.preferences?.bot)).map((m) => m.user_id as string)
  } else if (typeof to === 'string' && UUID.test(to) && (await refOk(ctx, '@members', to))) ids = [to]
  else throw new Bad('invalid_field', 'to must be "creator", "all" or a member id')
  const url = safePath(body.url, `/app/${ctx.ws.slug}`)
  const n = await notifyUsers(ctx.ws.id, ids, { type: 'api', title: `${ctx.key.name} · ${title}`, body: typeof body.body === 'string' ? body.body : null, url })
  return json({ ok: true, notified: n }, 201)
}

// ── alerts (scope notifications:write) ──
async function alerts(ctx: Ctx, method: string, body: Row) {
  if (method === 'GET') {
    if (!ctx.key.scopes.includes('notifications:write')) return fail(403, 'insufficient_scope', 'Missing scope notifications:write')
    return json({ data: { types: ALERT_TYPES, routes: routesFrom(ctx.ws.settings), severities: ['info', 'success', 'warning', 'critical'] } })
  }
  if (method !== 'POST') return fail(405, 'method_not_allowed', 'Method not allowed')
  if (!ctx.key.scopes.includes('notifications:write')) return fail(403, 'insufficient_scope', 'Missing scope notifications:write')
  const type = body.type
  if (typeof type !== 'string' || !(ALERT_TYPES as readonly string[]).includes(type)) throw new Bad('invalid_field', `type must be one of ${ALERT_TYPES.join(', ')}`)
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : ''
  if (!title) throw new Bad('missing_field', 'title is required')
  const sev = body.severity
  if (sev !== undefined && !['info', 'success', 'warning', 'critical'].includes(String(sev))) throw new Bad('invalid_field', 'severity must be info, success, warning or critical')
  const r = await emitAlert(ctx.a, ctx.ws, ctx.key, {
    type: type as AlertType, title, severity: sev as Severity | undefined,
    body: typeof body.body === 'string' ? body.body.slice(0, 4000) : undefined,
    channel: typeof body.channel === 'string' ? cleanChannel(body.channel) : undefined,
    link: typeof body.link === 'string' && /^(https?:\/\/|\/)/.test(body.link) ? body.link.slice(0, 500) : undefined,
  })
  await log(ctx, `alert.${type}`, 'alert')
  return json({ data: r }, r.skipped ? 200 : 201)
}

// ── release notes: finished tasks between two dates, grouped by project ──
async function changelog(ctx: Ctx) {
  if (!ctx.key.scopes.includes('tasks:read')) return fail(403, 'insufficient_scope', 'Missing scope tasks:read')
  const p = ctx.url.searchParams
  const until = p.get('until') && !Number.isNaN(Date.parse(p.get('until')!)) ? new Date(p.get('until')!) : new Date()
  const since = p.get('since') && !Number.isNaN(Date.parse(p.get('since')!)) ? new Date(p.get('since')!) : new Date(until.getTime() - 14 * 864e5)
  const en = p.get('lang') === 'en'
  let q = ctx.a.from('tasks').select('id,title,tags,project_id,completed_at').eq('workspace_id', ctx.ws.id).eq('status', 'done').is('deleted_at', null).gte('completed_at', since.toISOString()).lte('completed_at', until.toISOString()).order('completed_at', { ascending: true }).limit(500)
  if (p.get('project') && UUID.test(p.get('project')!)) q = q.eq('project_id', p.get('project')!)
  const { data: tasks, error } = await q
  if (error) return fail(500, 'db_error', 'Query failed')
  const { data: projects } = await ctx.a.from('projects').select('id,name').eq('workspace_id', ctx.ws.id)
  const names = new Map((projects ?? []).map((x) => [x.id as string, x.name as string]))
  const groups = new Map<string, { project: string; tasks: { id: string; title: string; tags: string[] }[] }>()
  for (const t of tasks ?? []) {
    const k = (t.project_id as string | null) ?? '_'
    if (!groups.has(k)) groups.set(k, { project: names.get(k) ?? (en ? 'Other' : 'Autres'), tasks: [] })
    groups.get(k)!.tasks.push({ id: t.id as string, title: t.title as string, tags: (t.tags as string[]) ?? [] })
  }
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  const md = [`# ${en ? 'Release notes' : 'Notes de version'} — ${fmt(since)} → ${fmt(until)}`, '']
  for (const g of groups.values()) { md.push(`## ${g.project}`); for (const t of g.tasks) md.push(`- ${t.title}${t.tags.length ? ` _(${t.tags.join(', ')})_` : ''}`); md.push('') }
  if (!groups.size) md.push(en ? 'No task finished in this period.' : 'Aucune tâche terminée sur cette période.')
  return json({ data: { since: since.toISOString(), until: until.toISOString(), count: tasks?.length ?? 0, groups: [...groups.values()], markdown: md.join('\n').trim() } })
}

// ── OpenAPI description (public, no key needed) ──
function openapi(origin: string) {
  const bearer = [{ bearerAuth: [] }]
  const list = (summary: string, scope: string) => ({ get: { summary, security: bearer, 'x-scope': scope, responses: { '200': { description: 'OK' } } } })
  const crudPaths = Object.entries(RES).flatMap(([name, spec]) => [
    [`/${name}`, { get: { summary: `List ${name}`, 'x-scope': `${spec.scope}:read`, security: bearer, parameters: [{ name: 'q', in: 'query', schema: { type: 'string' } }, { name: 'limit', in: 'query', schema: { type: 'integer', maximum: 200 } }, { name: 'offset', in: 'query', schema: { type: 'integer' } }, { name: 'updated_since', in: 'query', schema: { type: 'string', format: 'date-time' } }, ...(spec.filters ?? []).map((f) => ({ name: f, in: 'query', schema: { type: 'string' } }))], responses: { '200': { description: 'OK' } } }, post: { summary: `Create ${spec.label}`, 'x-scope': `${spec.scope}:write`, security: bearer, requestBody: { content: { 'application/json': { schema: { type: 'object', properties: Object.fromEntries(Object.keys(spec.cols).map((c) => [c, {}])), required: REQUIRED[name] ?? [] } } } }, responses: { '201': { description: 'Created' } } } }],
    [`/${name}/{id}`, { get: { summary: `Get ${spec.label}`, 'x-scope': `${spec.scope}:read`, security: bearer, responses: { '200': { description: 'OK' } } }, patch: { summary: `Update ${spec.label}`, 'x-scope': `${spec.scope}:write`, security: bearer, responses: { '200': { description: 'OK' } } }, delete: { summary: spec.soft ? `Move ${spec.label} to the Trash` : `Delete ${spec.label}`, 'x-scope': `${spec.scope}:write`, security: bearer, responses: { '200': { description: 'OK' } } } }],
  ] as [string, object][])
  return {
    openapi: '3.0.3', info: { title: 'Flow API', version: '1.0.0', description: 'Scoped API keys create bot members. Soft deletes. 120 requests/minute/key.' }, servers: [{ url: `${origin}/api/v1` }],
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'flw_…' } } },
    paths: {
      '/me': list('Current key, scopes and workspace', 'any'),
      ...Object.fromEntries(crudPaths),
      '/channels': list('List channels', 'messages:read'),
      '/messages': { get: { summary: 'List messages (?channel=id|name)', 'x-scope': 'messages:read', security: bearer, responses: { '200': { description: 'OK' } } }, post: { summary: 'Post a message {channel,text,file_ids?,reply_to?,notify?}', 'x-scope': 'messages:write', security: bearer, responses: { '201': { description: 'Created' } } } },
      '/files': { get: { summary: 'List files', 'x-scope': 'files:read', security: bearer, responses: { '200': { description: 'OK' } } }, post: { summary: 'Upload ≤ 4 MB (JSON or multipart)', 'x-scope': 'files:write', security: bearer, responses: { '201': { description: 'Created' } } } },
      '/files/upload-url': { post: { summary: 'Signed upload URL (≤ 25 MB), then PUT bytes, then /files/register', 'x-scope': 'files:write', security: bearer, responses: { '200': { description: 'OK' } } } },
      '/files/register': { post: { summary: 'Register an uploaded file', 'x-scope': 'files:write', security: bearer, responses: { '201': { description: 'Created' } } } },
      '/captures/upload-url': { post: { summary: 'Signed upload URL for a big capture file (≤ 25 MB), then PUT bytes, then POST /captures {upload_path,name,mime}', 'x-scope': 'captures:write', security: bearer, responses: { '200': { description: 'OK' } } } },
      '/notifications': { post: { summary: 'Notify {title,body?,url?,to: creator|all|id}', 'x-scope': 'notifications:write', security: bearer, responses: { '201': { description: 'Created' } } } },
      '/alerts': { get: { summary: 'Alert routing', 'x-scope': 'notifications:write', security: bearer, responses: { '200': { description: 'OK' } } }, post: { summary: 'Emit an alert {type,title,body?,severity?,channel?,link?}', 'x-scope': 'notifications:write', security: bearer, responses: { '201': { description: 'Created' } } } },
      '/changelog': { get: { summary: 'Release notes from finished tasks (?since&until&project&lang=fr|en)', 'x-scope': 'tasks:read', security: bearer, responses: { '200': { description: 'OK' } } } },
    },
  }
}

// ── entry ──
async function authenticate(req: Request, a: Admin): Promise<{ ws: Ctx['ws']; key: StoredKey } | Response> {
  const h = req.headers.get('authorization') ?? ''
  const raw = h.toLowerCase().startsWith('bearer ') ? h.slice(7).trim() : (req.headers.get('x-api-key') ?? '').trim()
  if (!raw.startsWith(KEY_PREFIX) || raw.length > 200) return fail(401, 'unauthorized', 'Missing or invalid API key. Send: Authorization: Bearer flw_…')
  const hash = hashKey(raw)
  const { data: ws } = await a.from('workspaces').select('id,name,slug,settings').contains('settings', { api_keys: [{ hash }] }).maybeSingle()
  const key = ((ws?.settings as { api_keys?: StoredKey[] } | null)?.api_keys ?? []).find((k) => sameHash(k.hash, hash))
  if (!ws || !key) return fail(401, 'unauthorized', 'Invalid or revoked API key')
  if (key.expires_at && Date.parse(key.expires_at) < Date.now()) return fail(401, 'expired', 'This API key has expired')
  // The key must act as a real bot member of this workspace (an admin cannot forge a key that impersonates a person).
  const { data: bot } = await a.from('profiles').select('preferences').eq('id', key.bot_id).maybeSingle()
  if (!(bot?.preferences as { bot?: boolean } | null)?.bot) return fail(401, 'unauthorized', 'Invalid API key')
  if (limited(key.id)) return fail(429, 'rate_limited', 'Too many requests (120/minute per key)')
  return { ws: { id: ws.id, name: ws.name, slug: ws.slug, settings: ws.settings }, key }
}

async function handle(req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  try {
    const first0 = (await params).path?.[0]
    if (first0 === 'openapi.json' && req.method === 'GET') return NextResponse.json(openapi(new URL(req.url).origin), { headers: { 'cache-control': 'public, max-age=300' } })
    const a = getAdminDb()
    const auth = await authenticate(req, a)
    if (auth instanceof Response) return auth
    const ctx: Ctx = { a, ws: auth.ws, key: auth.key, url: new URL(req.url) }
    const [first, id, sub] = (await params).path ?? []
    const method = req.method
    let body: Row = {}
    if (method !== 'GET' && method !== 'DELETE' && !(req.headers.get('content-type') ?? '').startsWith('multipart/form-data')) {
      const raw = await req.text()
      if (raw.length > 6 * 1024 * 1024) return fail(413, 'too_large', 'Body too large')
      if (raw) { try { body = JSON.parse(raw) } catch { return fail(400, 'bad_json', 'Body must be valid JSON') } }
      if (typeof body !== 'object' || body === null || Array.isArray(body)) return fail(400, 'bad_json', 'Body must be a JSON object')
    }

    if (!first) return json({ name: 'Flow API', version: 'v1', workspace: auth.ws.name, docs: `${ctx.url.origin}/app/${auth.ws.slug}/settings?tab=api`, resources: [...Object.keys(RES), 'channels', 'messages', 'files', 'notifications', 'alerts', 'changelog'], scopes: ALL_SCOPES })
    if (first === 'me') return json({ data: { workspace: auth.ws, key: { id: auth.key.id, name: auth.key.name, prefix: auth.key.prefix, scopes: auth.key.scopes, expires_at: auth.key.expires_at }, bot_user_id: auth.key.bot_id } })
    if (first === 'captures') return await captures(ctx, req, method, id, body)
    if (RES[first]) return await crud(ctx, method, first, id, RES[first], body)
    if (first === 'channels' && method === 'GET') {
      if (!auth.key.scopes.includes('messages:read')) return fail(403, 'insufficient_scope', 'Missing scope messages:read')
      const { data: cs } = await a.from('conversations').select('id,name,description,type,is_private').eq('workspace_id', auth.ws.id).in('type', ['channel', 'group']).order('created_at')
      return json({ data: cs })
    }
    if (first === 'messages') return await messages(ctx, method, id, body)
    if (first === 'files') return await files(ctx, req, method, id, sub, body)
    if (first === 'notifications' && method === 'POST') return await notify(ctx, body)
    if (first === 'alerts') return await alerts(ctx, method, body)
    if (first === 'changelog' && method === 'GET') return await changelog(ctx)
    return fail(404, 'not_found', 'Unknown endpoint')
  } catch (e) {
    if (e instanceof Bad) return fail(e.status, e.code, e.message)
    return fail(500, 'server_error', 'Unexpected error')
  }
}

export { handle as GET, handle as POST, handle as PATCH, handle as DELETE }
