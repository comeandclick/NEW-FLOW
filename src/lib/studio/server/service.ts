import 'server-only'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { notifyUsers } from '@/lib/api/notify'
import { studioDb, type Row } from './db'

const db = () => studioDb()
export const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const token = (n = 32) => randomBytes(n).toString('base64url')
const now = () => new Date().toISOString()
// le pont sonde toutes les 20 s au repos et n'écrit sa présence que toutes les 30 s : « en ligne » si vu depuis moins de 75 s
const ONLINE_MS = 75_000
const CODE_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export const normalizeCode = (c: string) => {
  const raw = c.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^FLOW/, '')
  return raw.length === 8 ? `FLOW-${raw.slice(0, 4)}-${raw.slice(4)}` : ''
}
const newCode = () => { const b = randomBytes(8); const s = Array.from(b, (x) => CODE_ALPHA[x % CODE_ALPHA.length]).join(''); return `FLOW-${s.slice(0, 4)}-${s.slice(4)}` }
const safeName = (n: string) => n.replace(/[^\w.\- ()]+/g, '_').slice(0, 120) || 'fichier'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const uuid = (x: unknown): string => { if (typeof x !== 'string' || !UUID_RE.test(x)) throw new StudioError(400, 'invalid_id'); return x }
/** Limites anti-abus (modifiables par variables d'environnement). */
const LIMITS = { jobsPerUser: Number(process.env.STUDIO_MAX_JOBS ?? 300), activeJobs: Number(process.env.STUDIO_MAX_ACTIVE ?? 8), assetsPerJob: 200, quotaBytes: Number(process.env.STUDIO_QUOTA_BYTES ?? 10 * 1024 ** 3), pendingPairings: 300, specBytes: 100_000 }

export class StudioError extends Error { constructor(public status: number, public code: string, msg?: string) { super(msg ?? code) } }

/* ───────── Appairage ───────── */
export async function pairStart(info: { deviceName?: string; os?: string; version?: string }) {
  const pend = await db().select('studio_pairings', { status: 'pending' }, { limit: LIMITS.pendingPairings + 1 })
  const fresh = pend.filter((p) => new Date(p.expires_at) > new Date())
  for (const p of pend) if (new Date(p.expires_at) <= new Date()) await db().update('studio_pairings', { id: p.id }, { status: 'expired' })
  if (fresh.length > LIMITS.pendingPairings) throw new StudioError(429, 'busy')
  const code = newCode(), poll = token(24)
  await db().insert('studio_pairings', {
    code_hash: sha(code), poll_hash: sha(poll), device_name: (info.deviceName || 'Mac').slice(0, 80), os: (info.os || 'macOS').slice(0, 30), bridge_version: info.version?.slice(0, 20) ?? null,
    status: 'pending', created_at: now(), expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  })
  return { code, pollToken: poll, expiresInSec: 600 }
}

export async function pairPoll(pollToken: string) {
  const [p] = await db().select('studio_pairings', { poll_hash: sha(pollToken) })
  if (!p) throw new StudioError(404, 'unknown')
  if (p.status === 'pending') return new Date(p.expires_at) < new Date() ? { status: 'expired' as const } : { status: 'pending' as const }
  if (p.status === 'paired' && p.device_token_once) {
    await db().update('studio_pairings', { id: p.id }, { status: 'collected', device_token_once: null })
    return { status: 'paired' as const, deviceToken: p.device_token_once as string }
  }
  return { status: 'expired' as const }
}

export async function pairConfirm(userId: string, rawCode: string) {
  const code = normalizeCode(rawCode)
  if (!code) throw new StudioError(400, 'bad_code')
  const [p] = await db().select('studio_pairings', { code_hash: sha(code) })
  if (!p || p.status !== 'pending' || new Date(p.expires_at) < new Date()) throw new StudioError(404, 'code_invalid_or_expired')
  const deviceToken = `fd_${token(32)}`
  const dev = await db().insert('studio_devices', { user_id: userId, name: p.device_name, os: p.os, token_hash: sha(deviceToken), bridge_version: p.bridge_version, paired_at: now(), last_seen: now() })
  await db().update('studio_pairings', { id: p.id }, { status: 'paired', user_id: userId, device_id: dev.id, device_token_once: deviceToken })
  await assignWaiting(userId, dev.id)
  return publicDevice(dev)
}

const publicDevice = (d: Row) => ({ id: d.id, name: d.name, os: d.os, pairedAt: d.paired_at, lastSeen: d.last_seen, online: Date.now() - new Date(d.last_seen).getTime() < ONLINE_MS, busyJob: d.busy_job ?? null, version: d.bridge_version ?? null, claudeOk: d.claude_ok ?? null, setup: d.setup ?? null })
export async function listDevices(userId: string) { return (await db().select('studio_devices', { user_id: userId }, { order: ['paired_at', false] })).map(publicDevice) }
export async function removeDevice(userId: string, id: string) {
  uuid(id)
  await db().remove('studio_devices', { id, user_id: userId })
}

export async function deviceFromToken(tok: string | null) {
  if (!tok) throw new StudioError(401, 'no_token')
  const [d] = await db().select('studio_devices', { token_hash: sha(tok) })
  if (!d) throw new StudioError(401, 'bad_token')
  return d
}

async function bestDevice(userId: string) {
  const devs = await db().select('studio_devices', { user_id: userId })
  // le Mac vu le plus récemment ; à égalité, le dernier relié
  return devs.map((d, i) => ({ d, i })).sort((a, b) => (a.d.last_seen < b.d.last_seen ? 1 : a.d.last_seen > b.d.last_seen ? -1 : a.d.paired_at < b.d.paired_at ? 1 : a.d.paired_at > b.d.paired_at ? -1 : b.i - a.i))[0]?.d ?? null
}

async function event(jobId: string, e: { level?: string; kind?: string; title: string; body?: string | null; data?: unknown }) {
  return db().insert('studio_events', { job_id: jobId, at: now(), level: e.level ?? 'info', kind: e.kind ?? 'log', title: e.title.slice(0, 200), body: e.body?.slice(0, 4000) ?? null, data: e.data ?? null })
}

async function notify(job: Row, title: string, body: string, kind: string) {
  if (db().kind !== 'supabase') return
  try { await notifyUsers(job.workspace_id, [job.user_id], { type: 'studio', title, body, url: `/app/${job.spec?.wsSlug ?? ''}/${job.kind === 'motion' ? 'motion' : 'site?tab=projects'}`.replace('//', '/') }) } catch { /* best effort */ }
  void kind
}

/** Jobs prêts sans Mac assigné : ils partent dès qu'un Mac est relié. */
async function assignWaiting(userId: string, deviceId: string) {
  const waiting = await db().select('studio_jobs', { user_id: userId, status: 'queued', device_id: null })
  for (const j of waiting) {
    await db().update('studio_jobs', { id: j.id }, { device_id: deviceId, updated_at: now() })
    await db().insert('studio_commands', { job_id: j.id, device_id: deviceId, type: 'start', payload: {}, created_at: now() })
    await event(j.id, { kind: 'status', title: 'Mac relié : la demande est envoyée' })
  }
}

/* ───────── Jobs (côté utilisateur) ───────── */
export type JobInput = { kind: 'motion' | 'site'; title: string; spec: Record<string, unknown>; prompt: string; workspaceId?: string | null }
export async function createJob(userId: string, input: JobInput) {
  if (JSON.stringify(input.spec ?? {}).length > LIMITS.specBytes) throw new StudioError(413, 'spec_too_large')
  const mine = await db().select('studio_jobs', { user_id: userId }, { limit: LIMITS.jobsPerUser + 1 })
  if (mine.length > LIMITS.jobsPerUser) throw new StudioError(429, 'too_many_jobs')
  if (mine.filter((j) => ['draft', 'queued', 'starting', 'running', 'paused', 'needs_answer'].includes(j.status)).length >= LIMITS.activeJobs) throw new StudioError(429, 'too_many_active')
  const id = randomUUID()
  const job = await db().insert('studio_jobs', {
    id, user_id: userId, workspace_id: input.workspaceId ?? null, kind: input.kind, title: input.title.slice(0, 160) || 'Sans titre', spec: input.spec, prompt: input.prompt.replaceAll('{{ID}}', id).slice(0, 120_000),
    status: 'draft', progress: 0, created_at: now(), updated_at: now(),
  })
  return job
}

export async function registerAsset(userId: string, jobId: string, a: { name: string; size?: number; mime?: string; kind?: string }, origin: string) {
  uuid(jobId)
  const [job] = await db().select('studio_jobs', { id: jobId, user_id: userId })
  if (!job) throw new StudioError(404, 'job')
  const owned = await db().select('studio_assets', { user_id: userId }, { limit: 5000 })
  if (owned.filter((x) => x.job_id === jobId).length >= LIMITS.assetsPerJob) throw new StudioError(429, 'too_many_files')
  if (owned.reduce((n, x) => n + Number(x.size ?? 0), 0) + Number(a.size ?? 0) > LIMITS.quotaBytes) throw new StudioError(413, 'quota')
  const id = randomUUID()
  const storage_path = `${userId}/${jobId}/in/${id.slice(0, 8)}-${safeName(a.name)}`
  const asset = await db().insert('studio_assets', { id, job_id: jobId, user_id: userId, direction: 'in', kind: a.kind ?? 'file', name: safeName(a.name), size: a.size ?? null, mime: a.mime ?? null, storage_path, uploaded: false, created_at: now() })
  return { asset, upload: await db().signedUpload(storage_path, origin) }
}
export async function assetUploaded(userId: string, assetId: string) {
  uuid(assetId); await db().update('studio_assets', { id: assetId, user_id: userId }, { uploaded: true }) }

export async function submitJob(userId: string, jobId: string) {
  uuid(jobId)
  const [job] = await db().select('studio_jobs', { id: jobId, user_id: userId })
  if (!job) throw new StudioError(404, 'job')
  if (job.status !== 'draft') throw new StudioError(409, 'already_submitted')
  const dev = await bestDevice(userId)
  await db().update('studio_jobs', { id: jobId }, { status: 'queued', device_id: dev?.id ?? null, updated_at: now() })
  await event(jobId, { kind: 'status', title: 'Demande enregistrée', body: dev ? `Envoyée à « ${dev.name} ».` : 'Aucun Mac relié : elle partira dès la connexion d\'un Mac.' })
  if (dev) await db().insert('studio_commands', { job_id: jobId, device_id: dev.id, type: 'start', payload: {}, created_at: now() })
  return getJob(userId, jobId)
}

const publicJob = (j: Row, dev?: Row) => ({
  id: j.id, kind: j.kind, title: j.title, spec: j.spec, status: j.status, step: j.step ?? null, progress: j.progress ?? 0, error: j.error ?? null,
  sessionId: j.session_id ?? null, deliver: j.deliver ?? null, createdAt: j.created_at, startedAt: j.started_at ?? null, finishedAt: j.finished_at ?? null, updatedAt: j.updated_at,
  device: dev ? publicDevice(dev) : null,
})

export async function listJobs(userId: string) {
  const [jobs, devs] = await Promise.all([db().select('studio_jobs', { user_id: userId }, { order: ['created_at', false], limit: 60 }), db().select('studio_devices', { user_id: userId })])
  return jobs.map((j) => publicJob(j, devs.find((d) => d.id === j.device_id)))
}

export async function getJob(userId: string, jobId: string, origin = '') {
  uuid(jobId)
  const [job] = await db().select('studio_jobs', { id: jobId, user_id: userId })
  if (!job) throw new StudioError(404, 'job')
  const [events, questions, assets, devs] = await Promise.all([
    db().select('studio_events', { job_id: jobId }, { order: ['id', false], limit: 300 }),
    db().select('studio_questions', { job_id: jobId }, { order: ['asked_at', true] }),
    db().select('studio_assets', { job_id: jobId }, { order: ['created_at', true] }),
    job.device_id ? db().select('studio_devices', { id: job.device_id }) : Promise.resolve([] as Row[]),
  ])
  const assetsOut = await Promise.all(assets.map(async (a) => ({
    id: a.id, direction: a.direction, kind: a.kind, name: a.name, size: a.size, mime: a.mime, uploaded: a.uploaded, createdAt: a.created_at, link: a.link ?? null,
    url: a.uploaded && a.storage_path ? await db().signedDownload(a.storage_path, origin, 3600) : null,
  })))
  const [todoEv] = await db().select('studio_events', { job_id: jobId, kind: 'todo' }, { limit: 1 })
  return {
    ...publicJob(job, devs[0]),
    todo: (todoEv?.data?.items ?? []) as { text: string; state: 'todo' | 'doing' | 'done' }[],
    events: events.filter((e) => e.kind !== 'todo' && e.kind !== 'preview').reverse().map((e) => ({ id: e.id, at: e.at, level: e.level, kind: e.kind, title: e.title, body: e.body, data: e.data })),
    questions: questions.map((q) => ({ id: q.id, text: q.text, choices: q.choices, askedAt: q.asked_at, answer: q.answer ?? null, answeredAt: q.answered_at ?? null })),
    assets: assetsOut,
  }
}

export async function controlJob(userId: string, jobId: string, action: 'pause' | 'resume' | 'cancel' | 'retry') {
  uuid(jobId)
  const [job] = await db().select('studio_jobs', { id: jobId, user_id: userId })
  if (!job) throw new StudioError(404, 'job')
  const active = ['starting', 'running', 'needs_answer'].includes(job.status)
  const dev = job.device_id ? (await db().select('studio_devices', { id: job.device_id }))[0] : await bestDevice(userId)
  const cmd = (type: string, payload: Row = {}) => dev ? db().insert('studio_commands', { job_id: jobId, device_id: dev.id, type, payload, created_at: now() }) : Promise.resolve(null)
  if (action === 'pause') {
    if (!active) throw new StudioError(409, 'not_running')
    await db().update('studio_jobs', { id: jobId }, { status: 'paused', updated_at: now() }); await cmd('pause')
    await event(jobId, { kind: 'status', title: 'Pause demandée' })
  } else if (action === 'resume') {
    if (job.status !== 'paused') throw new StudioError(409, 'not_paused')
    await db().update('studio_jobs', { id: jobId }, { status: 'running', updated_at: now() }); await cmd('resume')
    await event(jobId, { kind: 'status', title: 'Reprise demandée' })
  } else if (action === 'cancel') {
    if (['done', 'cancelled'].includes(job.status)) throw new StudioError(409, 'finished')
    await db().update('studio_jobs', { id: jobId }, { status: 'cancelled', finished_at: now(), updated_at: now() }); await cmd('cancel')
    await event(jobId, { kind: 'status', level: 'warning', title: 'Demande annulée' })
  } else {
    if (!['failed', 'cancelled'].includes(job.status)) throw new StudioError(409, 'not_failed')
    await db().update('studio_jobs', { id: jobId }, { status: 'queued', error: null, finished_at: null, device_id: dev?.id ?? null, updated_at: now() }); await cmd('start', { retry: true })
    await event(jobId, { kind: 'status', title: 'Relance demandée' })
  }
  return getJob(userId, jobId)
}

/** mode : now = interrompt l'étape en cours · next = après l'étape en cours · after = à la fin (ou tout de suite si c'est déjà fini). */
export async function sendMessage(userId: string, jobId: string, text: string, mode: 'now' | 'next' | 'after', assetIds: string[] = [], origin = '') {
  uuid(jobId)
  const msg = text.trim().slice(0, 8000)
  if (!msg && !assetIds.length) throw new StudioError(400, 'empty')
  const [job] = await db().select('studio_jobs', { id: jobId, user_id: userId })
  if (!job) throw new StudioError(404, 'job')
  const dev = job.device_id ? (await db().select('studio_devices', { id: job.device_id }))[0] : await bestDevice(userId)
  if (!dev) throw new StudioError(409, 'no_device')
  const files: { name: string; url: string | null; kind: string }[] = []
  for (const id of assetIds.slice(0, 20)) {
    const [a] = await db().select('studio_assets', { id, job_id: jobId, user_id: userId })
    if (a?.uploaded && a.storage_path) files.push({ name: a.name, kind: a.kind, url: await db().signedDownload(a.storage_path, origin, 86_400) })
  }
  const ev = await event(jobId, { kind: 'message', title: 'Message envoyé à Claude', body: msg || null, data: { from: 'user', mode, state: 'sent', files: files.map((f) => ({ name: f.name, kind: f.kind })) } })
  await db().insert('studio_commands', { job_id: jobId, device_id: dev.id, type: 'message', payload: { text: msg, mode, eventId: ev.id, files }, created_at: now() })
  if (['done', 'failed', 'cancelled'].includes(job.status)) await db().update('studio_jobs', { id: jobId }, { status: 'queued', finished_at: null, updated_at: now() })
  return { eventId: ev.id }
}

export async function answerQuestion(userId: string, jobId: string, questionId: string, answer: string) {
  uuid(jobId); uuid(questionId)
  const [job] = await db().select('studio_jobs', { id: jobId, user_id: userId })
  const [q] = await db().select('studio_questions', { id: questionId, job_id: jobId })
  if (!job || !q) throw new StudioError(404, 'question')
  if (q.answer) throw new StudioError(409, 'answered')
  const a = answer.trim().slice(0, 4000)
  if (!a) throw new StudioError(400, 'empty')
  await db().update('studio_questions', { id: questionId }, { answer: a, answered_at: now() })
  const open = (await db().select('studio_questions', { job_id: jobId })).filter((x) => !x.answer && x.id !== questionId)
  if (!open.length && job.status === 'needs_answer') await db().update('studio_jobs', { id: jobId }, { status: 'running', updated_at: now() })
  await event(jobId, { kind: 'message', title: 'Réponse envoyée', body: a, data: { from: 'user', state: 'sent' } })
  if (job.device_id) await db().insert('studio_commands', { job_id: jobId, device_id: job.device_id, type: 'answer', payload: { questionId, text: a, question: q.text }, created_at: now() })
}

export async function removeJob(userId: string, jobId: string) {
  uuid(jobId); await db().remove('studio_jobs', { id: jobId, user_id: userId }) }

export async function library(userId: string, origin: string) {
  const [assets, jobs] = await Promise.all([db().select('studio_assets', { user_id: userId }, { order: ['created_at', false], limit: 300 }), db().select('studio_jobs', { user_id: userId }, { order: ['created_at', false], limit: 100 })])
  const title = new Map(jobs.map((j) => [j.id as string, j.title as string]))
  const files = await Promise.all(assets.filter((a) => a.uploaded || a.link).map(async (a) => ({
    id: a.id, kind: a.direction === 'in' ? 'sent' : a.kind === 'site' ? 'site' : 'render', name: a.name, size: a.size, mime: a.mime, jobId: a.job_id, jobTitle: title.get(a.job_id) ?? null, at: a.created_at,
    url: a.link ?? (a.storage_path ? await db().signedDownload(a.storage_path, origin, 3600) : null),
  })))
  const sites = jobs.filter((j) => j.kind === 'site' && j.deliver?.url).map((j) => ({ id: `site-${j.id}`, kind: 'site', name: j.title, size: null, mime: null, jobId: j.id, jobTitle: j.title, at: j.finished_at ?? j.updated_at, url: j.deliver.url as string }))
  return [...sites, ...files].sort((a, b) => (a.at < b.at ? 1 : -1))
}

/* ───────── Pont (côté Mac) ───────── */
/** État des logiciels du Mac (envoyé par le pont) : composants, installation en cours, journal. */
export async function bridgeSetup(dev: Row, setup: Record<string, unknown>) {
  try { await db().update('studio_devices', { id: dev.id }, { setup: { ...setup, at: now() } }) } catch { /* colonne absente : migration 2 non exécutée */ }
}
export type SetupAction = { action: 'install' | 'login' | 'rescan' | 'open_studio' | 'open_claude'; component?: string; choice?: string }
export async function requestSetup(userId: string, deviceId: string, a: SetupAction) {
  uuid(deviceId)
  const [dev] = await db().select('studio_devices', { id: deviceId, user_id: userId })
  if (!dev) throw new StudioError(404, 'device')
  if (!['install', 'login', 'rescan', 'open_studio', 'open_claude'].includes(a.action)) throw new StudioError(400, 'invalid')
  try {
    await db().insert('studio_commands', { job_id: null, device_id: dev.id, type: 'setup', payload: { action: a.action, component: a.component ?? null, choice: a.choice ?? null }, created_at: now() })
  } catch { throw new StudioError(409, 'migration_required') }
}

export async function bridgePoll(dev: Row, info: { busyJob?: string | null; version?: string; claudeOk?: boolean }) {
  // écriture seulement si quelque chose change ou toutes les 30 s (au lieu de chaque sondage : moins de travail par appel)
  const change = (info.busyJob ?? null) !== (dev.busy_job ?? null) || (!!info.version && info.version !== dev.bridge_version) || (info.claudeOk !== undefined && info.claudeOk !== dev.claude_ok)
  const vieux = !dev.last_seen || Date.now() - new Date(dev.last_seen as string).getTime() > 30_000
  if (change || vieux) await db().update('studio_devices', { id: dev.id }, { last_seen: now(), busy_job: info.busyJob ?? null, ...(info.claudeOk !== undefined ? { claude_ok: info.claudeOk } : {}), ...(info.version ? { bridge_version: info.version } : {}) })
  await assignWaiting(dev.user_id, dev.id)
  const cmds = await db().select('studio_commands', { device_id: dev.id, delivered_at: null }, { order: ['id', true], limit: 50 })
  for (const c of cmds) await db().update('studio_commands', { id: c.id }, { delivered_at: now() })
  const watch = info.busyJob ? await isWatched(info.busyJob).catch(() => false) : false
  return { commands: cmds.map((c) => ({ id: c.id, jobId: c.job_id ?? null, type: c.type, payload: c.payload })), serverTime: Date.now(), watch }
}

export async function bridgeJobs(dev: Row) {
  const jobs = await db().select('studio_jobs', { user_id: dev.user_id }, { order: ['created_at', false], limit: 60 })
  return jobs.map((j) => ({ id: j.id, kind: j.kind, title: j.title, status: j.status, progress: j.progress ?? 0, step: j.step ?? null, url: (j.deliver?.url as string | undefined) ?? null, summary: (j.deliver?.summary as string | undefined) ?? null, createdAt: j.created_at, finishedAt: j.finished_at ?? null }))
}

export async function bridgeJob(dev: Row, jobId: string, origin: string) {
  uuid(jobId)
  const [job] = await db().select('studio_jobs', { id: jobId, user_id: dev.user_id })
  if (!job) throw new StudioError(404, 'job')
  const assets = (await db().select('studio_assets', { job_id: jobId, direction: 'in' })).filter((a) => a.uploaded && a.storage_path)
  const inputs = await Promise.all(assets.map(async (a) => ({ id: a.id, name: a.name, kind: a.kind, size: a.size, url: await db().signedDownload(a.storage_path, origin, 7200) })))
  const questions = await db().select('studio_questions', { job_id: jobId })
  return { id: job.id, kind: job.kind, title: job.title, prompt: job.prompt, spec: job.spec, status: job.status, sessionId: job.session_id ?? null, inputs, answered: questions.filter((q) => q.answer).map((q) => ({ id: q.id, text: q.text, answer: q.answer })) }
}

export type BridgeEvent =
  | { type: 'status'; status: 'starting' | 'running' | 'paused' | 'done' | 'failed' | 'cancelled' | 'needs_answer'; step?: string; progress?: number; error?: string; title?: string; body?: string }
  | { type: 'step'; step: string; progress?: number; detail?: string }
  | { type: 'log'; title: string; body?: string; level?: 'info' | 'success' | 'warning' | 'error' }
  | { type: 'question'; text: string; choices?: string[] }
  | { type: 'session'; sessionId: string }
  | { type: 'msgstate'; eventId: number; state: 'delivered' | 'applied' }
  | { type: 'delivered'; deliver?: Record<string, unknown>; summary?: string }
  | { type: 'answered'; text: string }
  | { type: 'todo'; items: { text: string; state: 'todo' | 'doing' | 'done' }[] }

export async function bridgeEvent(dev: Row, jobId: string, ev: BridgeEvent) {
  uuid(jobId)
  const [job] = await db().select('studio_jobs', { id: jobId, user_id: dev.user_id })
  if (!job) throw new StudioError(404, 'job')
  const patch: Row = { updated_at: now() }
  if (ev.type === 'status') {
    // une pause ou une annulation demandées depuis Flow ne sont pas écrasées par un état « running » en retard
    if (job.status === 'cancelled' && ev.status !== 'cancelled') return
    patch.status = ev.status
    if (ev.step) patch.step = ev.step
    if (ev.progress != null) patch.progress = Math.max(0, Math.min(100, Math.round(ev.progress)))
    if (ev.error) patch.error = ev.error.slice(0, 1000)
    if (ev.status === 'starting' && !job.started_at) patch.started_at = now()
    if (['done', 'failed', 'cancelled'].includes(ev.status)) patch.finished_at = now()
    await db().update('studio_jobs', { id: jobId }, patch)
    const title = ev.title ?? ({ starting: 'Claude démarre', running: 'Reprise du travail', paused: 'En pause', done: 'Terminé', failed: 'Échec', cancelled: 'Annulé', needs_answer: 'Claude attend ta réponse' }[ev.status])
    await event(jobId, { kind: 'status', level: ev.status === 'failed' ? 'error' : ev.status === 'done' ? 'success' : 'info', title, body: ev.body ?? ev.error })
    if (ev.status === 'failed') await notify(job, 'Un projet a échoué', `${job.title} : ${ev.error ?? 'erreur'}`, 'failed')
  } else if (ev.type === 'step') {
    patch.step = ev.step
    if (ev.progress != null) patch.progress = Math.max(0, Math.min(100, Math.round(ev.progress)))
    await db().update('studio_jobs', { id: jobId }, patch)
    await event(jobId, { kind: 'step', title: ev.step, body: ev.detail, data: { step: ev.step, progress: ev.progress } })
  } else if (ev.type === 'log') {
    await event(jobId, { kind: 'log', level: ev.level ?? 'info', title: ev.title, body: ev.body })
  } else if (ev.type === 'question') {
    patch.status = 'needs_answer'
    const q = { id: randomUUID() }
    await db().insert('studio_questions', { id: q.id, job_id: jobId, text: ev.text.slice(0, 2000), choices: ev.choices ?? null, asked_at: now() })
    await db().update('studio_jobs', { id: jobId }, patch)
    await event(jobId, { kind: 'question', level: 'question', title: 'Claude te pose une question', body: ev.text, data: { questionId: q.id } })
    await notify(job, 'Claude te pose une question', ev.text, 'question')
  } else if (ev.type === 'session') {
    patch.session_id = ev.sessionId
    await db().update('studio_jobs', { id: jobId }, patch)
  } else if (ev.type === 'msgstate') {
    const [e] = await db().select('studio_events', { id: ev.eventId })
    if (e) await db().update('studio_events', { id: ev.eventId }, { data: { ...(e.data ?? {}), state: ev.state } })
  } else if (ev.type === 'todo') {
    const items = (Array.isArray(ev.items) ? ev.items : []).slice(0, 60).map((i) => ({ text: String(i?.text ?? '').slice(0, 200), state: (['todo', 'doing', 'done'] as const).find((x) => x === i?.state) ?? 'todo' })).filter((i) => i.text)
    const [cur] = await db().select('studio_events', { job_id: jobId, kind: 'todo' }, { limit: 1 })
    if (cur) await db().update('studio_events', { id: cur.id }, { data: { items }, at: now() })
    else await event(jobId, { kind: 'todo', title: 'Liste des tâches', data: { items } })
  } else if (ev.type === 'answered') {
    const text = String(ev.text ?? '').slice(0, 4000)
    for (const q of (await db().select('studio_questions', { job_id: jobId })).filter((x) => !x.answer)) await db().update('studio_questions', { id: q.id }, { answer: text, answered_at: now() })
    if (job.status === 'needs_answer') await db().update('studio_jobs', { id: jobId }, { status: 'running', updated_at: now() })
  } else if (ev.type === 'delivered') {
    patch.status = 'done'; patch.progress = 100; patch.finished_at = now(); patch.deliver = ev.deliver ? { ...ev.deliver, ...(ev.summary ? { summary: String(ev.summary).slice(0, 9000) } : {}) } : (ev.summary ? { summary: String(ev.summary).slice(0, 9000) } : null)
    await db().update('studio_jobs', { id: jobId }, patch)
    await event(jobId, { kind: 'result', level: 'success', title: job.kind === 'site' ? 'Ton site est en ligne' : 'Ton motion design est prêt', body: ev.summary ? String(ev.summary).slice(0, 500) : (ev.deliver?.url as string | undefined) })
    await notify(job, job.kind === 'site' ? 'Ton site est en ligne' : 'Ton motion design est prêt', job.title, 'done')
  }
}

export async function bridgeAsset(dev: Row, jobId: string, a: { name: string; size?: number; mime?: string; kind?: string; link?: string }, origin: string) {
  uuid(jobId)
  if (a.link && !/^https:\/\/[^\s]+$/i.test(a.link)) throw new StudioError(400, 'bad_link')
  const [job] = await db().select('studio_jobs', { id: jobId, user_id: dev.user_id })
  if (!job) throw new StudioError(404, 'job')
  const id = randomUUID()
  if (a.link) { await db().insert('studio_assets', { id, job_id: jobId, user_id: dev.user_id, direction: 'out', kind: a.kind ?? 'site', name: safeName(a.name), link: a.link, uploaded: true, created_at: now() }); return { id, upload: null } }
  const storage_path = `${dev.user_id}/${jobId}/out/${id.slice(0, 8)}-${safeName(a.name)}`
  await db().insert('studio_assets', { id, job_id: jobId, user_id: dev.user_id, direction: 'out', kind: a.kind ?? 'render', name: safeName(a.name), size: a.size ?? null, mime: a.mime ?? null, storage_path, uploaded: false, created_at: now() })
  return { id, upload: await db().signedUpload(storage_path, origin) }
}
export async function bridgeAssetDone(dev: Row, assetId: string) {
  uuid(assetId); await db().update('studio_assets', { id: assetId, user_id: dev.user_id }, { uploaded: true }) }


/* ───────── Aperçus en direct (captures du Mac : page du site, logiciel de montage) ───────── */
export type PreviewSlot = 'site' | 'editor' | 'studio'
const SLOTS: PreviewSlot[] = ['site', 'editor', 'studio']
type PreviewMeta = { slots: Partial<Record<PreviewSlot, { path: string; at: string; w?: number; h?: number; label?: string }>>; viewedAt?: string; n?: number }
const previewRow = async (jobId: string) => (await db().select('studio_events', { job_id: jobId, kind: 'preview' }, { limit: 1 }))[0]

/** Le pont demande où envoyer une capture : 3 noms tournants par zone, pour que le navigateur ne montre jamais une image périmée. */
export async function bridgePreview(dev: Row, jobId: string, slot: string, origin: string) {
  uuid(jobId)
  if (!SLOTS.includes(slot as PreviewSlot)) throw new StudioError(400, 'slot')
  const [job] = await db().select('studio_jobs', { id: jobId, user_id: dev.user_id })
  if (!job) throw new StudioError(404, 'job')
  const row = await previewRow(jobId)
  const n = ((row?.data as PreviewMeta | undefined)?.n ?? 0) + 1
  const storage_path = `${dev.user_id}/${jobId}/preview/${slot}-${n % 3}.jpg`
  return { path: storage_path, upload: await db().signedUpload(storage_path, origin) }
}
export async function bridgePreviewDone(dev: Row, jobId: string, slot: string, path: string, size: { w?: number; h?: number; label?: string }) {
  uuid(jobId)
  if (!SLOTS.includes(slot as PreviewSlot) || path.includes('..') || !/^[\w./-]+$/.test(path) || !path.startsWith(`${dev.user_id}/${jobId}/preview/`)) throw new StudioError(400, 'slot')
  const [job] = await db().select('studio_jobs', { id: jobId, user_id: dev.user_id })
  if (!job) throw new StudioError(404, 'job')
  const row = await previewRow(jobId)
  const meta: PreviewMeta = { ...((row?.data as PreviewMeta | undefined) ?? { slots: {} }) }
  meta.slots = { ...meta.slots, [slot]: { path, at: now(), w: size.w, h: size.h, label: size.label?.slice(0, 80) } }
  meta.n = (meta.n ?? 0) + 1
  if (row) await db().update('studio_events', { id: row.id }, { data: meta })
  else await event(jobId, { kind: 'preview', title: 'Aperçu', data: meta })
}
/** Lecture par Flow : renvoie les liens signés et note que quelqu'un regarde (le pont capture alors plus souvent). */
export async function getPreview(userId: string, jobId: string, origin: string) {
  uuid(jobId)
  const [job] = await db().select('studio_jobs', { id: jobId, user_id: userId })
  if (!job) throw new StudioError(404, 'job')
  const row = await previewRow(jobId)
  const meta = ((row?.data as PreviewMeta | undefined) ?? { slots: {} }) as PreviewMeta
  if (row && (!meta.viewedAt || Date.now() - new Date(meta.viewedAt).getTime() > 8000)) await db().update('studio_events', { id: row.id }, { data: { ...meta, viewedAt: now() } })
  else if (!row) await event(jobId, { kind: 'preview', title: 'Aperçu', data: { slots: {}, viewedAt: now() } })
  const slots: Record<string, { url: string; at: string; w?: number; h?: number; label?: string }> = {}
  for (const [k, v] of Object.entries(meta.slots ?? {})) {
    if (!v) continue
    const url = await db().signedDownload(v.path, origin, 300)
    if (url) slots[k] = { url, at: v.at, w: v.w, h: v.h, label: v.label }
  }
  return { slots }
}
/** Quelqu'un regarde-t-il ce projet en ce moment ? (le pont s'en sert pour capturer toutes les 3 s au lieu de 15 s) */
export async function isWatched(jobId: string) {
  const row = await previewRow(jobId)
  const v = (row?.data as PreviewMeta | undefined)?.viewedAt
  return !!v && Date.now() - new Date(v).getTime() < 25_000
}
