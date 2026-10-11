#!/usr/bin/env node
// Flow Bridge : relie ce Mac à Flow. Reçoit les demandes (motion design, sites), lance Claude Code dessus, envoie l'état,
// les questions et les résultats, et applique pause / reprise / annulation / messages venant de Flow.
// Aucune dépendance : Node 20+ seulement.  Usage :  node flow-bridge.mjs connect | start | status | install | uninstall | logs
import { spawn, execFileSync } from 'node:child_process'
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync, renameSync, appendFileSync, readdirSync, rmSync } from 'node:fs'
import { homedir, hostname, platform } from 'node:os'
import path from 'node:path'
import readline from 'node:readline'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'

const VERSION = '1.0.0'
const HOME = homedir()
const DIR = process.env.FLOW_BRIDGE_HOME || path.join(HOME, '.flow-bridge')
const CONFIG = path.join(DIR, 'config.json')
const STATE = path.join(DIR, 'state.json')
const LOG = path.join(DIR, 'bridge.log')
const SELF = fileURLToPath(import.meta.url)
mkdirSync(DIR, { recursive: true })

const DEFAULTS = {
  server: 'https://new-flow-dashboard.vercel.app',
  deviceToken: null,
  motionRoot: path.join(HOME, 'Developer', 'mon-atelier', 'studio'),
  atelier: path.join(HOME, 'Developer', 'mon-atelier'),
  sitesRoot: path.join(HOME, 'Developer', 'sites'),
  claudeBin: 'claude',
  claudeArgsPrefix: [],
  maxNudges: 8,
}
function resolveClaude(bin) {
  if (bin !== 'claude') return bin
  const cands = ['claude', path.join(HOME, '.claude', 'local', 'claude'), path.join(HOME, '.local', 'bin', 'claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude']
  for (const c of cands) { try { execFileSync(c, ['--version'], { stdio: 'pipe', timeout: 10000, env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? ''}` } }); return c } catch {} }
  return bin
}
const readJson = (f, d) => { try { return JSON.parse(readFileSync(f, 'utf8')) } catch { return d } }
let claudeResolved = null
const cfg = () => { const c = { ...DEFAULTS, ...readJson(CONFIG, {}), ...(process.env.FLOW_SERVER ? { server: process.env.FLOW_SERVER } : {}) }; if (c.claudeBin === 'claude') c.claudeBin = (claudeResolved ??= resolveClaude('claude')); return c }
const saveCfg = (c) => writeFileSync(CONFIG, JSON.stringify(c, null, 2), { mode: 0o600 })
const log = (...a) => { try { if (statSync(LOG).size > 5_000_000) renameSync(LOG, LOG + '.1') } catch {}
   const l = `${new Date().toISOString()} ${a.join(' ')}\n`; try { appendFileSync(LOG, l) } catch {} if (process.stdout.isTTY || process.env.FLOW_BRIDGE_VERBOSE) process.stdout.write(l) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ───────── Réseau ───────── */
async function api(method, route, body, { auth = true, raw = false } = {}) {
  const c = cfg()
  const res = await fetch(`${c.server}/api/studio/${route}`, {
    method,
    headers: { 'content-type': 'application/json', ...(auth && c.deviceToken ? { authorization: `Bearer ${c.deviceToken}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  })
  if (raw) return res
  const j = await res.json().catch(() => ({}))
  if (!res.ok) { const e = new Error(`${route}: ${res.status} ${j.error ?? ''}`); e.status = res.status; throw e }
  return j
}
/** Envoie un événement ; réessaie quelques fois (réseau instable) sans jamais bloquer le travail. */
async function emit(jobId, event) {
  for (let i = 0; i < 4; i++) { try { await api('POST', 'bridge/event', { jobId, event }); return } catch (e) { if (e.status === 401 || e.status === 404) return; await sleep(1000 * (i + 1)) } }
}

/* ───────── État persistant ───────── */
const state = readJson(STATE, { jobs: {} })
const saveState = () => writeFileSync(STATE, JSON.stringify(state))
const runs = new Map() // jobId -> processus en cours

/* ───────── Protocole donné à Claude (ajouté au prompt de Flow) ───────── */
const STEPS = {
  motion: ['receive', 'analyse', 'plan', 'build', 'compare', 'sound', 'render4k', 'verify'],
  site: ['interview', 'analyse', 'design', 'structure', 'build', 'data', 'deploy', 'qa', 'motion', 'deliver'],
}
function protocol(kind, dir) {
  const steps = STEPS[kind].join(' | ')
  return `

---
## Protocole du pont Flow (obligatoire, en plus de tout ce qui précède)
Le pont Flow lit ces fichiers dans \`${dir}\` pour tenir l'utilisateur au courant. Écris-les en JSON valide.
1. **Avancement** : à CHAQUE changement d'étape (et au moins toutes les 5 minutes), écris \`progress.json\` : \`{"step":"<étape>","progress":<0-100>,"detail":"<une phrase simple>"}\`. Étapes dans l'ordre : ${steps}. « progress » est le pourcentage global honnête.
2. **Question** : seulement pour un blocage réel (accès refusé, achat payant, décision juridique). Écris \`QUESTION.json\` : \`{"question":"…","choices":["…","…"]}\`, puis CONTINUE tout ce qui n'en dépend pas. La réponse arrive dans \`REPONSE.json\` et dans un message.
3. **Messages de l'utilisateur** : il peut t'écrire à tout moment. Lis-les, applique-les, puis reprends le plan.
4. **Livraison** : ${kind === 'motion' ? '`rendu/final.mp4` + `rendu/rapport.json` (`{"statut":"ok",…}`) + `rendu/rapport.md`' : '`LIVRAISON.json` (`{"statut":"ok","url":"https://…"}`) + `LIVRAISON.md`'}. Le pont n'envoie le résultat que quand ces fichiers existent. Ne t'arrête jamais avant.
5. Écris ces fichiers à la racine du projet ci-dessus (pas ailleurs).
`
}

/* ───────── Claude Code connecté ? ───────── */
let claudeCache = { at: 0, ok: false }
function claudeOk(force = false) {
  if (!force && Date.now() - claudeCache.at < 60_000) return claudeCache.ok
  const c = cfg()
  let ok = false
  if (c.claudeBin === 'node') ok = true // faux Claude de test
  else { try { ok = JSON.parse(execFileSync(c.claudeBin, ['auth', 'status'], { stdio: 'pipe', timeout: 15000, env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? ''}` } }).toString()).loggedIn === true } catch { ok = false } }
  claudeCache = { at: Date.now(), ok }
  return ok
}

/* ───────── Aide fichiers ───────── */
const safe = (n) => n.replace(/[^\w.\- ()]+/g, '_').slice(0, 120) || 'fichier'
async function download(url, dest) {
  const res = await fetch(url, { signal: AbortSignal.timeout(10 * 60_000) })
  if (!res.ok) throw new Error(`download ${res.status}`)
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
}
async function upload(up, file, mime) {
  const size = statSync(file).size
  if (up.form) { // Supabase Storage : FormData comme uploadToSignedUrl
    const body = new FormData(); body.append('cacheControl', '3600'); body.append('', new Blob([readFileSync(file)], { type: mime || 'application/octet-stream' }))
    const r = await fetch(up.url, { method: up.method || 'PUT', headers: { ...(up.headers || {}) }, body, signal: AbortSignal.timeout(30 * 60_000) })
    if (!r.ok) throw new Error(`upload ${r.status} ${(await r.text().catch(() => '')).slice(0, 200)}`)
    return
  }
  const res = await fetch(up.url, { method: up.method || 'PUT', headers: { 'content-type': mime || 'application/octet-stream', 'content-length': String(size), ...(up.headers || {}) }, body: Readable.toWeb(createReadStream(file)), duplex: 'half', signal: AbortSignal.timeout(30 * 60_000) })
  if (!res.ok) throw new Error(`upload ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`)
}
const jsonFile = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')) } catch { return null } }

/* ───────── Exécution d'un projet ───────── */
const jobDir = (c, job) => path.join(job.kind === 'motion' ? c.motionRoot : c.sitesRoot, job.id)
const busy = () => [...runs.values()].find((r) => !r.exited)

function userLine(text) { return JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] } }) + '\n' }
function send(run, text) { if (run.exited || !run.child.stdin.writable) return false; run.child.stdin.write(userLine(text)); return true }

function claudeArgs(c, sessionId) {
  const a = [...c.claudeArgsPrefix, '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'bypassPermissions', '--add-dir', c.atelier]
  if (sessionId) a.push('--resume', sessionId)
  return a
}

async function startRun(job, { firstMessage, resume = false } = {}) {
  const c = cfg()
  const dir = jobDir(c, job)
  const st = (state.jobs[job.id] ??= { dir, sessionId: job.sessionId ?? null, nudges: 0, afterQueue: [] })
  st.dir = dir
  mkdirSync(path.join(dir, 'entrees'), { recursive: true })
  for (const sub of job.kind === 'motion' ? ['analyse', 'scripts', 'sons', 'rendu'] : ['rendu']) mkdirSync(path.join(dir, sub), { recursive: true })
  if (!resume) {
    for (const f of job.inputs) { try { await download(f.url, path.join(dir, 'entrees', safe(f.name))) } catch (e) { log('input', f.name, e.message) } }
    writeFileSync(path.join(dir, 'PROMPT.md'), job.prompt + protocol(job.kind, dir))
  }
  const prompt = firstMessage ?? (job.prompt + protocol(job.kind, dir) + (job.inputs.length ? `\n\nLes fichiers fournis sont déjà copiés dans \`${path.join(dir, 'entrees')}\`.` : ''))
  const child = spawn(c.claudeBin, claudeArgs(c, resume ? st.sessionId : null), {
    cwd: dir, detached: true, stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? ''}`, FLOW_JOB_ID: job.id, FLOW_JOB_DIR: dir },
  })
  const run = { job, child, dir, exited: false, paused: false, cancelled: false, delivered: false, finalizing: false, stderr: '', lastLog: 0, appliedIds: [], interrupting: false, waitingAnswer: false, progressMtime: 0, startedAt: Date.now() }
  runs.set(job.id, run)
  st.pid = child.pid; st.status = 'running'; saveState()
  child.stderr.on('data', (d) => { run.stderr = (run.stderr + d.toString()).slice(-4000) })
  child.on('error', (e) => { run.stderr += String(e); })
  child.on('exit', (code, sig) => onExit(run, code, sig))
  readline.createInterface({ input: child.stdout }).on('line', (l) => onLine(run, l))
  child.stdin.on('error', () => {})
  send(run, prompt)
  run.watch = setInterval(() => watchFiles(run), 2000)
  await emit(job.id, { type: 'status', status: 'starting', title: resume ? 'Claude reprend la session' : 'Claude démarre sur ton Mac', body: dir })
  await emit(job.id, { type: 'status', status: 'running', progress: job.status === 'draft' ? 0 : undefined })
  log('start', job.id, job.kind, dir)
}

const short = (s, n = 240) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
function onLine(run, line) {
  let m; try { m = JSON.parse(line) } catch { return }
  const id = run.job.id
  if (m.type === 'system' && m.subtype === 'init' && m.session_id) {
    state.jobs[id].sessionId = m.session_id; saveState(); void emit(id, { type: 'session', sessionId: m.session_id })
  } else if (m.type === 'assistant') {
    for (const eid of run.appliedIds.splice(0)) void emit(id, { type: 'msgstate', eventId: eid, state: 'applied' })
    const now = Date.now()
    if (now - run.lastLog < 4000) return
    for (const part of m.message?.content ?? []) {
      if (part.type === 'tool_use') {
        const i = part.input ?? {}
        const what = i.command ? `$ ${short(i.command, 140)}` : i.file_path ? `${part.name} ${short(i.file_path, 120)}` : part.name
        run.lastLog = now; void emit(id, { type: 'log', title: part.name === 'Bash' ? 'Commande' : part.name, body: what }); break
      }
      if (part.type === 'text' && part.text?.trim()) { run.lastLog = now; void emit(id, { type: 'log', title: 'Claude', body: short(part.text, 300) }); break }
    }
  } else if (m.type === 'result') {
    if (m.session_id) { state.jobs[id].sessionId = m.session_id; saveState() }
    void onTurnEnd(run, m)
  }
}

function watchFiles(run) {
  if (run.exited || run.paused) return
  const id = run.job.id
  const pf = path.join(run.dir, 'progress.json')
  try {
    const mt = statSync(pf).mtimeMs
    if (mt !== run.progressMtime) {
      run.progressMtime = mt
      const p = jsonFile(pf)
      if (p?.step) void emit(id, { type: 'step', step: String(p.step), progress: typeof p.progress === 'number' ? p.progress : undefined, detail: p.detail ? short(p.detail, 300) : undefined })
    }
  } catch { /* pas encore écrit */ }
  const qf = path.join(run.dir, 'QUESTION.json')
  if (existsSync(qf)) {
    const q = jsonFile(qf)
    try { renameSync(qf, path.join(run.dir, `QUESTION.${Date.now()}.sent.json`)) } catch {}
    if (q?.question) { run.waitingAnswer = true; void emit(id, { type: 'question', text: String(q.question), choices: Array.isArray(q.choices) ? q.choices.map(String) : undefined }) }
  }
}

function delivery(run) {
  const d = run.dir
  if (run.job.kind === 'motion') {
    const r = jsonFile(path.join(d, 'rendu', 'rapport.json'))
    const f = path.join(d, 'rendu', 'final.mp4')
    return r?.statut === 'ok' && existsSync(f) ? { file: f, report: r } : null
  }
  const r = jsonFile(path.join(d, 'LIVRAISON.json'))
  return r?.statut === 'ok' && r.url ? { url: String(r.url), report: r } : null
}

async function onTurnEnd(run, result) {
  const id = run.job.id, st = state.jobs[id]
  if (run.cancelled || run.exited || run.finalizing) return
  if (run.interrupting) { run.interrupting = false; return } // le message de l'utilisateur arrive juste après
  watchFiles(run)
  const d = delivery(run)
  if (d) { await finalize(run, d); return }
  const txt = String(result.result ?? '')
  if (result.is_error && /not logged in|please run \/login|invalid api key/i.test(txt)) { await fail(run, 'Claude Code n\'est pas connecté sur ce Mac. Dans le Terminal : claude auth login, puis « Relancer ».'); return }
  if (result.is_error && /usage limit|limit reached|rate limit|resets? at/i.test(txt)) { // limite d'utilisation du forfait Claude : on attend puis on reprend (sans compter comme un arrêt)
    const mins = 15
    await emit(id, { type: 'log', level: 'warning', title: 'Limite d\'utilisation Claude atteinte', body: `${short(txt, 160)} — reprise automatique dans ${mins} min.` })
    run.limitTimer = setTimeout(() => { if (!run.exited && !run.cancelled) send(run, 'Continue exactement où tu t\'étais arrêté (progress.json) et termine jusqu\'à la livraison.') }, mins * 60_000)
    return
  }
  if (run.waitingAnswer) { await emit(id, { type: 'status', status: 'needs_answer' }); return }
  st.nudges = (st.nudges ?? 0) + 1; saveState()
  if (st.nudges > cfg().maxNudges) { await fail(run, `Claude s'est arrêté ${st.nudges - 1} fois sans livrer. Dernière réponse : ${short(result.result, 300)}`); return }
  await emit(id, { type: 'log', level: 'warning', title: 'Relance automatique', body: 'Claude s\'est arrêté avant la livraison : le pont lui demande de continuer.' })
  send(run, `Tu t'es arrêté avant la livraison. Les fichiers de livraison demandés n'existent pas encore. Relis ta liste d'étapes (progress.json), continue sans poser de question et termine tout, puis écris les fichiers de livraison.`)
}

async function finalize(run, d) {
  const id = run.job.id
  run.finalizing = true
  clearInterval(run.watch)
  try {
    await emit(id, { type: 'step', step: run.job.kind === 'motion' ? 'verify' : 'deliver', progress: 98, detail: 'Envoi du résultat vers Flow…' })
    const files = []
    if (d.file) {
      const size = statSync(d.file).size
      const a = await api('POST', 'bridge/asset', { jobId: id, name: path.basename(d.file), size, mime: 'video/mp4', kind: 'render' })
      await upload(a.upload, d.file, 'video/mp4'); await api('POST', 'bridge/asset-done', { assetId: a.id })
      files.push({ name: path.basename(d.file), size })
      const rm = path.join(run.dir, 'rendu', 'rapport.md')
      if (existsSync(rm)) { const b = await api('POST', 'bridge/asset', { jobId: id, name: 'rapport.md', size: statSync(rm).size, mime: 'text/markdown', kind: 'file' }); await upload(b.upload, rm, 'text/markdown'); await api('POST', 'bridge/asset-done', { assetId: b.id }) }
    }
    if (d.url) await api('POST', 'bridge/asset', { jobId: id, name: run.job.title, kind: 'site', link: d.url })
    const rm2 = ['rendu/rapport.md', 'LIVRAISON.md'].map((f) => path.join(run.dir, f)).find((f) => existsSync(f))
    const summary = rm2 ? short(readFileSync(rm2, 'utf8'), 500) : undefined
    await api('POST', 'bridge/event', { jobId: id, event: { type: 'delivered', deliver: d.url ? { url: d.url } : { files }, summary } })
    run.delivered = true; state.jobs[id].status = 'done'; saveState()
    log('delivered', id)
  } catch (e) {
    run.finalizing = false
    await fail(run, `Envoi du résultat impossible : ${e.message}`)
    return
  }
  const queued = state.jobs[id].afterQueue?.splice(0) ?? []
  saveState()
  if (queued.length) { // messages « à la fin » : on reprend la session avec eux
    run.exited = true; try { run.child.stdin.end() } catch {}
    await sleep(500)
    await runMessage(id, queued.join('\n\n'))
    return
  }
  try { run.child.stdin.end() } catch {}
  setTimeout(() => killGroup(run, 'SIGTERM'), 4000)
}

async function fail(run, error) {
  clearInterval(run.watch)
  state.jobs[run.job.id].status = 'failed'; saveState()
  await emit(run.job.id, { type: 'status', status: 'failed', error: error + (run.stderr ? ` | ${short(run.stderr, 300)}` : '') })
  try { run.child.stdin.end() } catch {}
  killGroup(run, 'SIGTERM')
}

function onExit(run, code, sig) {
  run.exited = true; clearInterval(run.watch)
  log('exit', run.job.id, code, sig)
  if (run.cancelled || run.delivered || run.finalizing || run.restarting) return
  if (state.jobs[run.job.id]?.status === 'failed') return
  void fail(run, `Claude Code s'est arrêté (code ${code ?? sig}).`)
}

function killGroup(run, signal) {
  if (signal === 'SIGTERM' || signal === 'SIGKILL') clearTimeout(run.limitTimer)
  try { process.kill(-run.child.pid, signal) } catch { try { run.child.kill(signal) } catch {} } }

/* ───────── Commandes venant de Flow ───────── */
async function attach(jobId, files) {
  const st = state.jobs[jobId]
  if (!files?.length) return ''
  let dir = st?.dir
  if (!dir) { const { job } = await api('GET', `bridge/job?id=${jobId}`); dir = jobDir(cfg(), job) }
  mkdirSync(path.join(dir, 'entrees'), { recursive: true })
  const got = []
  for (const f of files) {
    if (!f.url) continue
    const name = `msg-${Date.now()}-${safe(f.name)}`
    try { await download(f.url, path.join(dir, 'entrees', name)); got.push(`entrees/${name}`) } catch (e) { log('attach', f.name, e.message) }
  }
  return got.length ? `\n\nFichiers joints par l'utilisateur (dans ${dir}) :\n${got.map((g) => `- ${g}`).join('\n')}` : ''
}

async function runMessage(jobId, text, { eventId, mode = 'next', files } = {}) {
  text = text + await attach(jobId, files)
  const run = runs.get(jobId)
  const st = state.jobs[jobId]
  if (run && !run.exited) {
    if (mode === 'after' && !run.delivered) { (st.afterQueue ??= []).push(text); saveState(); if (eventId) await emit(jobId, { type: 'msgstate', eventId, state: 'delivered' }); await emit(jobId, { type: 'log', title: 'Message en attente', body: 'Il sera traité à la fin du travail en cours.' }); return }
    if (run.paused) { killGroup(run, 'SIGCONT'); run.paused = false }
    if (mode === 'now') {
      run.interrupting = true
      try { run.child.stdin.write(JSON.stringify({ type: 'control_request', request_id: `int_${Date.now()}`, request: { subtype: 'interrupt' } }) + '\n') } catch {}
      for (let i = 0; i < 25 && run.interrupting && !run.exited; i++) await sleep(200)
      if (run.interrupting && !run.exited) { // l'interruption n'a pas répondu : on arrête proprement et on reprend la même session avec le message
        run.interrupting = false; run.restarting = true; killGroup(run, 'SIGTERM'); await sleep(1200)
        const sid = state.jobs[jobId]?.sessionId
        if (sid) { const { job } = await api('GET', `bridge/job?id=${jobId}`); await startRun(job, { resume: true, firstMessage: `Message de l'utilisateur (priorité : applique-le, puis reprends ton plan) :\n${text}` }); if (eventId) { await emit(jobId, { type: 'msgstate', eventId, state: 'delivered' }); runs.get(jobId)?.appliedIds.push(eventId) } return }
      }
    }
    send(run, `Message de l'utilisateur (priorité : applique-le, puis reprends ton plan) :\n${text}`)
    if (eventId) { await emit(jobId, { type: 'msgstate', eventId, state: 'delivered' }); run.appliedIds.push(eventId) }
    await emit(jobId, { type: 'status', status: 'running', title: 'Message transmis à Claude' })
    return
  }
  // Pas de processus : le travail est fini (ou arrêté) -> on reprend la même session de Claude avec ce message.
  if (busy()) { await emit(jobId, { type: 'log', level: 'warning', title: 'Mac occupé', body: 'Un autre projet tourne : ton message sera traité après.' }); await sleep(3000); return runMessage(jobId, text, { eventId, mode }) }
  const { job } = await api('GET', `bridge/job?id=${jobId}`)
  state.jobs[jobId] ??= { dir: jobDir(cfg(), job), sessionId: job.sessionId, nudges: 0, afterQueue: [] }
  if (!state.jobs[jobId].sessionId) state.jobs[jobId].sessionId = job.sessionId
  const ds = delivery({ dir: state.jobs[jobId].dir, job })
  state.jobs[jobId].nudges = 0
  await startRun(job, { resume: !!state.jobs[jobId].sessionId, firstMessage: `Message de l'utilisateur après la livraison${ds ? ' (le résultat précédent est déjà livré ; si ta modification change le résultat, refais la livraison complète avec les mêmes fichiers)' : ''} :\n${text}` })
  if (eventId) await emit(jobId, { type: 'msgstate', eventId, state: 'delivered' })
  const r = runs.get(jobId); if (r && eventId) r.appliedIds.push(eventId)
}

async function handle(cmd) {
  const { jobId, type, payload } = cmd
  const run = runs.get(jobId)
  log('cmd', type, jobId)
  try {
    if (type === 'start') {
      if (run && !run.exited) return
      if (!claudeOk(true)) { await emit(jobId, { type: 'status', status: 'failed', error: 'Claude Code n\'est pas connecté sur ce Mac. Ouvre le Terminal et lance :  claude auth login  puis clique sur « Relancer ».' }); return }
      if (busy()) { await emit(jobId, { type: 'log', title: 'En file d\'attente', body: 'Un autre projet tourne sur ce Mac : celui-ci démarre juste après.' }); pending.push(cmd); return }
      const { job } = await api('GET', `bridge/job?id=${jobId}`)
      const st = state.jobs[jobId]
      await startRun(job, { resume: !!(payload?.retry && st?.sessionId), firstMessage: payload?.retry && st?.sessionId ? 'Relance demandée : reprends exactement où tu t\'étais arrêté (progress.json) et termine jusqu\'à la livraison.' : undefined })
    } else if (type === 'pause') {
      if (!run || run.exited || run.paused) return
      run.paused = true; killGroup(run, 'SIGSTOP'); await emit(jobId, { type: 'status', status: 'paused' })
    } else if (type === 'resume') {
      if (!run || run.exited || !run.paused) return
      run.paused = false; killGroup(run, 'SIGCONT'); await emit(jobId, { type: 'status', status: 'running' })
    } else if (type === 'cancel') {
      if (!run || run.exited) { await emit(jobId, { type: 'status', status: 'cancelled' }); return }
      run.cancelled = true; clearInterval(run.watch); killGroup(run, 'SIGCONT'); killGroup(run, 'SIGTERM'); setTimeout(() => killGroup(run, 'SIGKILL'), 4000)
      state.jobs[jobId].status = 'cancelled'; saveState(); await emit(jobId, { type: 'status', status: 'cancelled' })
    } else if (type === 'message') {
      await runMessage(jobId, payload.text, { eventId: payload.eventId, mode: payload.mode, files: payload.files })
    } else if (type === 'answer') {
      if (!run || run.exited) return
      run.waitingAnswer = false
      writeFileSync(path.join(run.dir, 'REPONSE.json'), JSON.stringify({ question: payload.question, reponse: payload.text }, null, 2))
      send(run, `Réponse de l'utilisateur à ta question « ${short(payload.question, 200)} » : ${payload.text}\nContinue.`)
      await emit(jobId, { type: 'status', status: 'running', title: 'Réponse transmise à Claude' })
    }
  } catch (e) { log('cmd-error', type, jobId, e.message); await emit(jobId, { type: 'log', level: 'error', title: 'Erreur du pont', body: `${type} : ${e.message}` }) }
}

const pending = []
async function loop() {
  const c = cfg()
  if (!c.deviceToken) { console.error('Ce Mac n\'est pas relié. Lance :  node flow-bridge.mjs connect'); process.exit(1) }
  log('bridge démarré', VERSION, c.server)
  // reprise après redémarrage : un projet « running » dont le processus a disparu est signalé
  for (const [id, st] of Object.entries(state.jobs)) {
    if (st.status === 'running') { st.status = 'failed'; await emit(id, { type: 'status', status: 'failed', error: 'Le pont a redémarré pendant le travail. Utilise « Relancer » pour reprendre la session.' }) }
  }
  saveState()
  let stop = false
  const quit = () => { stop = true; for (const r of runs.values()) { try { killGroup(r, 'SIGCONT') } catch {} } setTimeout(() => process.exit(0), 300) }
  process.on('SIGTERM', quit); process.on('SIGINT', quit)
  while (!stop) {
    try {
      const b = busy()
      const out = await api('POST', 'bridge/poll', { busyJob: b?.job.id ?? null, version: VERSION, claudeOk: claudeOk() })
      for (const cmd of [...pending.splice(0), ...out.commands]) await handle(cmd)
    } catch (e) {
      if (e.status === 401) { console.error('Jeton refusé : relie à nouveau ce Mac (connect).'); log('401'); await sleep(15000) }
      else log('poll', e.message)
    }
    await sleep(busy() ? 1500 : 2500)
  }
}

/* ───────── Appairage ───────── */
async function connect() {
  const c = cfg()
  const info = { deviceName: process.env.FLOW_DEVICE_NAME || hostname().replace(/\.local$/, ''), os: platform() === 'darwin' ? 'macOS' : platform(), version: VERSION }
  const res = await api('POST', 'pair/start', info, { auth: false })
  console.log(`\n  Flow Bridge ${VERSION} — ${c.server}\n\n  Entre ce code dans Flow (Création de site > Connexion du Mac) :\n\n      ${res.code}\n\n  Il expire dans 10 minutes. En attente de validation…\n`)
  const t0 = Date.now()
  while (Date.now() - t0 < res.expiresInSec * 1000) {
    await sleep(2500)
    let r; try { r = await api('GET', `pair/poll?token=${encodeURIComponent(res.pollToken)}`, undefined, { auth: false }) } catch { continue }
    if (r.status === 'paired') { saveCfg({ ...readJson(CONFIG, {}), server: c.server, deviceToken: r.deviceToken }); console.log('  Mac relié. Lance maintenant :  node flow-bridge.mjs start  (ou install pour un démarrage automatique)\n'); return }
    if (r.status === 'expired') break
  }
  console.error('  Code expiré. Relance la commande connect.'); process.exit(1)
}

/* ───────── Service launchd (démarrage automatique, Mac gardé éveillé) ───────── */
const PLIST = path.join(HOME, 'Library', 'LaunchAgents', 'site.flow.bridge.plist')
function install() {
  if (platform() !== 'darwin') { console.error('install : macOS uniquement pour l\'instant.'); process.exit(1) }
  const node = process.execPath
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>site.flow.bridge</string>
  <key>ProgramArguments</key><array><string>/usr/bin/caffeinate</string><string>-i</string><string>${node}</string><string>${SELF}</string><string>start</string></array>
  <key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string></dict>
  <key>StandardOutPath</key><string>${path.join(DIR, 'launchd.out.log')}</string><key>StandardErrorPath</key><string>${path.join(DIR, 'launchd.err.log')}</string>
</dict></plist>
`
  mkdirSync(path.dirname(PLIST), { recursive: true }); writeFileSync(PLIST, xml)
  try { execFileSync('launchctl', ['unload', PLIST], { stdio: 'ignore' }) } catch {}
  execFileSync('launchctl', ['load', '-w', PLIST])
  console.log('Service installé : le pont démarre avec le Mac et empêche la mise en veille tant qu\'il tourne.')
}
function uninstall() { try { execFileSync('launchctl', ['unload', '-w', PLIST], { stdio: 'ignore' }) } catch {} try { rmSync(PLIST) } catch {} console.log('Service retiré.') }

async function status() {
  const c = cfg()
  console.log(`Flow Bridge ${VERSION}\n  serveur : ${c.server}\n  relié   : ${c.deviceToken ? 'oui' : 'non'}\n  projets : ${Object.keys(state.jobs).length}`)
  try { execFileSync(c.claudeBin, ['--version'], { stdio: 'pipe' }); console.log(`  claude  : installé, ${claudeOk(true) ? 'connecté' : 'NON CONNECTÉ (lance : claude auth login)'}`) } catch { console.log('  claude  : INTROUVABLE (installe Claude Code)') }
  if (c.deviceToken) { try { const o = await api('POST', 'bridge/poll', { version: VERSION, claudeOk: claudeOk(true) }); console.log(`  serveur : joignable (${o.commands.length} commande(s) en attente)`) } catch (e) { console.log(`  serveur : ${e.message}`) } }
}

const cmd = process.argv[2]
if (cmd === 'connect') await connect()
else if (cmd === 'start') await loop()
else if (cmd === 'status') await status()
else if (cmd === 'install') install()
else if (cmd === 'uninstall') uninstall()
else if (cmd === 'logs') console.log(readdirSync(DIR).includes('bridge.log') ? readFileSync(LOG, 'utf8').split('\n').slice(-60).join('\n') : '(aucun journal)')
else console.log('Usage : node flow-bridge.mjs connect | start | status | install | uninstall | logs\nVariables : FLOW_SERVER (adresse de Flow), FLOW_DEVICE_NAME, FLOW_BRIDGE_HOME')
