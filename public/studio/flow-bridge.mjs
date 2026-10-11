#!/usr/bin/env node
// Flow Bridge : relie ce Mac à Flow. Reçoit les demandes (motion design, sites), lance Claude Code dessus, envoie l'état,
// les questions et les résultats, et applique pause / reprise / annulation / messages venant de Flow.
// Aucune dépendance : Node 20+ seulement.  Usage :  node flow-bridge.mjs connect | start | status | install | uninstall | logs
import { spawn, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync, renameSync, appendFileSync, readdirSync, rmSync } from 'node:fs'
import { homedir, hostname, platform } from 'node:os'
import path from 'node:path'
import readline from 'node:readline'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'

const VERSION = '1.1.0'
const HOME = homedir()
const DIR = process.env.FLOW_BRIDGE_HOME || path.join(HOME, '.flow-bridge')
const CONFIG = path.join(DIR, 'config.json')
const STATE = path.join(DIR, 'state.json')
const LOG = path.join(DIR, 'bridge.log')
const SELF = fileURLToPath(import.meta.url)
mkdirSync(DIR, { recursive: true, mode: 0o700 })
try { chmodSync(DIR, 0o700) } catch {}

const DEFAULTS = {
  server: 'https://new-flow-dashboard.vercel.app',
  deviceToken: null,
  motionRoot: path.join(HOME, 'Developer', 'mon-atelier', 'studio'),
  atelier: path.join(HOME, 'Developer', 'mon-atelier'),
  sitesRoot: path.join(HOME, 'Developer', 'sites'),
  claudeBin: 'claude',
  claudeArgsPrefix: [],
  maxNudges: 12,
}
function resolveClaude(bin) {
  if (bin !== 'claude') return bin
  const cands = ['claude', path.join(DIR, 'npm', 'bin', 'claude'), path.join(HOME, '.claude', 'local', 'claude'), path.join(HOME, '.local', 'bin', 'claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude']
  for (const c of cands) { try { execFileSync(c, ['--version'], { stdio: 'pipe', timeout: 10000, env: { ...process.env, PATH: `${path.join(DIR, 'npm', 'bin')}:${path.join(DIR, 'node', 'bin')}:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? ''}` } }); return c } catch {} }
  return bin
}
const readJson = (f, d) => { try { return JSON.parse(readFileSync(f, 'utf8')) } catch { return d } }
let claudeResolved = null
const isLocalUrl = (u) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(u)
const urlOk = (u) => { try { const x = new URL(u); return x.protocol === 'https:' || isLocalUrl(u) } catch { return false } }
const cfg = () => { const c = { ...DEFAULTS, ...readJson(CONFIG, {}), ...(process.env.FLOW_SERVER ? { server: process.env.FLOW_SERVER } : {}) }; if (c.claudeBin === 'claude') c.claudeBin = (claudeResolved ??= resolveClaude('claude')); return c }
const saveCfg = (c) => { writeFileSync(CONFIG, JSON.stringify(c, null, 2), { mode: 0o600 }); try { chmodSync(CONFIG, 0o600) } catch {} }
const log = (...a) => { try { if (statSync(LOG).size > 5_000_000) renameSync(LOG, LOG + '.1') } catch {}
   const l = `${new Date().toISOString()} ${a.join(' ')}\n`; try { appendFileSync(LOG, l) } catch {} if (process.stdout.isTTY || process.env.FLOW_BRIDGE_VERBOSE) process.stdout.write(l) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ───────── Réseau ───────── */
async function api(method, route, body, { auth = true, raw = false } = {}) {
  const c = cfg()
  if (!urlOk(c.server)) throw new Error('adresse du serveur refusée : HTTPS obligatoire')
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
const saveState = () => { writeFileSync(STATE, JSON.stringify(state), { mode: 0o600 }) }
const runs = new Map() // jobId -> processus en cours

/* ───────── Protocole donné à Claude (ajouté au prompt de Flow) ───────── */
const STEPS = {
  motion: ['receive', 'analyse', 'plan', 'build', 'compare', 'sound', 'render4k', 'verify'],
  site: ['interview', 'analyse', 'design', 'structure', 'build', 'data', 'deploy', 'qa', 'motion', 'deliver'],
}
function protocol(kind, dir, spec = {}) {
  const steps = STEPS[kind].join(' | ')
  const noQ = spec?.noQuestions === true
  return `

---
## Protocole du pont Flow (obligatoire, en plus de tout ce qui précède)
Le pont Flow lit ces fichiers dans \`${dir}\` pour tenir l'utilisateur au courant. Écris-les en JSON valide.
1. **Avancement** : à CHAQUE changement d'étape (et au moins toutes les 5 minutes), écris \`progress.json\` : \`{"step":"<étape>","progress":<0-100>,"detail":"<une phrase simple>"}\`. Étapes dans l'ordre : ${steps}. « progress » est le pourcentage global honnête.
2. **Question** : ${noQ ? "l'utilisateur a demandé de NE PAS être dérangé : ne pose AUCUNE question, quoi qu'il arrive. Décide toi-même (option la plus professionnelle), note l'hypothèse dans le rapport et continue." : "seulement pour un blocage réel (accès refusé, achat payant, décision juridique). Écris `QUESTION.json` : `{\"question\":\"…\",\"choices\":[\"…\",\"…\"]}`, puis CONTINUE tout ce qui n'en dépend pas. La réponse arrive dans `REPONSE.json` et dans un message. Sans réponse après 20 minutes, décide toi-même."}
3. **Messages de l'utilisateur** : il peut t'écrire à tout moment. Lis-les, applique-les, puis reprends le plan.
4. **Livraison** : ${kind === 'motion' ? '`rendu/final.mp4` + `rendu/rapport.json` (`{"statut":"ok",…}`) + `rendu/rapport.md`' : '`LIVRAISON.json` (`{"statut":"ok","url":"https://…"}`) + `LIVRAISON.md`'}. Le pont n'envoie le résultat que quand ces fichiers existent. Ne t'arrête jamais avant.
5. Écris ces fichiers à la racine du projet ci-dessus (pas ailleurs).
6. **Liste des tâches (affichée en direct à l'utilisateur)** : dès le début, écris \`todo.json\` : \`{"items":[{"text":"<tâche courte>","state":"todo"}]}\` avec TOUTES les tâches prévues (10 à 25). À chaque tâche commencée mets \`"doing"\`, terminée \`"done"\` (une seule « doing » à la fois). Ajoute les tâches nouvelles qui apparaissent.
7. **Aperçu en direct** : ${kind === 'site' ? "dès que le serveur local du site tourne, écris `preview.json` : `{\"site\":\"http://localhost:<port>\"}` (adresse locale uniquement). Le pont l'ouvre dans une fenêtre et la montre à l'utilisateur en direct ; relance-la (même fichier) si le port change." : "garde le logiciel de motion (EffectCraft / After Effects) ouvert avec la composition visible pendant tout le travail : le pont la montre à l'utilisateur en direct."}
8. **Ne t'arrête jamais** : tu ne finis ton tour qu'après la livraison. Une tâche longue (rendu, installation, build) : lance-la, puis surveille-la avec des attentes courtes (\`sleep 20\`) dans le même tour. N'attends jamais une réponse pour avancer : aucune réponse n'arrive sans que tu aies écrit QUESTION.json.
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
  if (!urlOk(url)) throw new Error('adresse de téléchargement refusée')
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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const jobDir = (c, job) => { if (!UUID_RE.test(String(job.id))) throw new Error('identifiant de projet invalide'); return jobDirUnsafe(c, job) }
const jobDirUnsafe = (c, job) => path.join(job.kind === 'motion' ? c.motionRoot : c.sitesRoot, job.id)
const busy = () => [...runs.values()].find((r) => !r.exited)

function userLine(text) { return JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] } }) + '\n' }
function send(run, text) { if (run.exited || !run.child.stdin.writable) return false; run.child.stdin.write(userLine(text)); return true }

/** Environnement donné à Claude : sans aucun secret du pont ni variable sensible. */
function childEnv(job, dir) {
  const env = {}
  for (const [k, v] of Object.entries(process.env)) if (!/^FLOW_BRIDGE|^FLOW_SERVER$|SECRET|PASSWORD|PRIVATE_KEY|DEVICE_TOKEN/i.test(k)) env[k] = v
  return { ...env, PATH: `${OWN_BIN.join(':')}:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? ''}`, FLOW_JOB_ID: job.id, FLOW_JOB_DIR: dir }
}
/** Réglages de sécurité du projet : Claude ne lit pas les secrets du Mac (clés SSH, jeton du pont, trousseau…) et ne fait pas d'actions destructrices évidentes. */
const DENY = ['Read(~/.ssh/**)', 'Read(~/.aws/**)', 'Read(~/.config/gh/**)', 'Read(~/.gnupg/**)', 'Read(~/.flow-bridge/**)', 'Read(~/Library/Keychains/**)', 'Read(~/Library/Application Support/Google/Chrome/**)', 'Edit(~/.flow-bridge/**)', 'Edit(~/.ssh/**)', 'Edit(~/.zshrc)', 'Edit(~/.zprofile)', 'Bash(sudo:*)', 'Bash(rm -rf /:*)', 'Bash(rm -rf ~:*)', 'Bash(rm -rf $HOME:*)', 'Bash(cat ~/.flow-bridge/*:*)']
function writeProjectSettings(dir) {
  const d = path.join(dir, '.claude'); mkdirSync(d, { recursive: true })
  writeFileSync(path.join(d, 'settings.json'), JSON.stringify({ permissions: { deny: DENY } }, null, 2))
}

function claudeArgs(c, sessionId) {
  const a = [...c.claudeArgsPrefix, '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'bypassPermissions', '--add-dir', c.atelier]
  if (sessionId) a.push('--resume', sessionId)
  a.push('--disallowedTools', 'Bash(sudo:*)')
  return a
}

async function startRun(job, { firstMessage, resume = false } = {}) {
  const c = cfg()
  const dir = jobDir(c, job)
  const st = (state.jobs[job.id] ??= { dir, sessionId: job.sessionId ?? null, nudges: 0, afterQueue: [] })
  st.dir = dir
  mkdirSync(path.join(dir, 'entrees'), { recursive: true })
  for (const sub of job.kind === 'motion' ? ['analyse', 'scripts', 'sons', 'rendu'] : ['rendu']) mkdirSync(path.join(dir, sub), { recursive: true })
  writeProjectSettings(dir)
  if (!resume) {
    for (const f of job.inputs) { try { await download(f.url, path.join(dir, 'entrees', safe(f.name))) } catch (e) { log('input', f.name, e.message) } }
    writeFileSync(path.join(dir, 'PROMPT.md'), job.prompt + protocol(job.kind, dir, job.spec))
  }
  const prompt = firstMessage ?? (job.prompt + protocol(job.kind, dir, job.spec) + (job.inputs.length ? `\n\nLes fichiers fournis sont déjà copiés dans \`${path.join(dir, 'entrees')}\`.` : ''))
  const child = spawn(c.claudeBin, claudeArgs(c, resume ? st.sessionId : null), {
    cwd: dir, detached: true, stdio: ['pipe', 'pipe', 'pipe'],
    env: childEnv(job, dir),
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
  if (cfg().autoStudio !== false) openStudio(job.id) // ouvre la fenêtre Flow Studio (discussion, tâches, aperçus) à côté du travail
  setTimeout(() => tileWindows(run), 3500)
  void previewLoop(run)
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
  const tf = path.join(run.dir, 'todo.json')
  try {
    const mt = statSync(tf).mtimeMs
    if (mt !== run.todoMtime) {
      run.todoMtime = mt
      const t = jsonFile(tf); const items = Array.isArray(t) ? t : t?.items
      if (Array.isArray(items)) void emit(id, { type: 'todo', items: items.map((i) => (typeof i === 'string' ? { text: i, state: 'todo' } : { text: String(i?.text ?? i?.task ?? ''), state: ['todo', 'doing', 'done'].includes(i?.state) ? i.state : i?.done ? 'done' : 'todo' })) })
    }
  } catch { /* pas encore écrit */ }
  const pv = path.join(run.dir, 'preview.json')
  try {
    const mt = statSync(pv).mtimeMs
    if (mt !== run.previewMtime) { run.previewMtime = mt; const u = jsonFile(pv)?.site; if (typeof u === 'string') setPreviewUrl(run, u) }
  } catch { /* pas encore écrit */ }
  const qf = path.join(run.dir, 'QUESTION.json')
  if (existsSync(qf)) {
    const q = jsonFile(qf)
    try { renameSync(qf, path.join(run.dir, `QUESTION.${Date.now()}.sent.json`)) } catch {}
    if (run.job.spec?.noQuestions === true) send(run, 'L\'utilisateur ne veut AUCUNE question. Décide toi-même (option la plus professionnelle), note l\'hypothèse dans le rapport et continue.')
    else if (q?.question) {
      run.waitingAnswer = true; void emit(id, { type: 'question', text: String(q.question), choices: Array.isArray(q.choices) ? q.choices.map(String) : undefined })
      clearTimeout(run.questionTimer) // personne ne répond : Claude décide seul et continue, le projet ne reste jamais bloqué
      run.questionTimer = setTimeout(() => { if (run.waitingAnswer && !run.exited && !run.cancelled) { run.waitingAnswer = false; void emit(id, { type: 'status', status: 'running', title: 'Pas de réponse : Claude décide seul' }); send(run, 'Aucune réponse de l\'utilisateur après 20 minutes. Décide toi-même (option la plus professionnelle), note l\'hypothèse dans le rapport et continue jusqu\'à la livraison.') } }, 20 * 60_000)
    }
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
  if ((run.progressMtime ?? 0) !== (st.nudgeProgressMtime ?? 0)) { st.nudges = 0; st.nudgeProgressMtime = run.progressMtime } // il a avancé depuis la dernière relance : on repart à zéro
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
  const st = state.jobs[run.job.id]
  if (st?.sessionId && (st.crashes ?? 0) < 3 && !run.paused) { // arrêt inattendu : on reprend la même session (jusqu'à 3 fois)
    st.crashes = (st.crashes ?? 0) + 1; saveState()
    void emit(run.job.id, { type: 'log', level: 'warning', title: 'Claude s\'est arrêté : reprise automatique', body: `Reprise ${st.crashes}/3 de la même session.` })
    setTimeout(async () => { try { const { job } = await api('GET', `bridge/job?id=${run.job.id}`); await startRun(job, { resume: true, firstMessage: 'Tu as été interrompu. Reprends exactement où tu t\'étais arrêté (progress.json, todo.json) et termine jusqu\'à la livraison.' }) } catch (e) { await fail(run, `Claude Code s'est arrêté (code ${code ?? sig}).`) } }, 3000)
    return
  }
  void fail(run, `Claude Code s'est arrêté (code ${code ?? sig}).`)
}

function killGroup(run, signal) {
  if (signal === 'SIGTERM' || signal === 'SIGKILL') clearTimeout(run.limitTimer)
  try { process.kill(-run.child.pid, signal) } catch { try { run.child.kill(signal) } catch {} } }

/* ───────── Flow Studio : fenêtres bien rangées + aperçu en direct ───────── */
const NO_WINDOWS = process.env.FLOW_BRIDGE_NO_WINDOWS === '1' || FAKE_ENV()
function FAKE_ENV() { return process.env.FLOW_BRIDGE_FAKE === '1' }
const CHROME = '/Applications/Google Chrome.app'
const LOCAL_URL = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?(\/[^\s"'<>\\]*)?$/
const osa = (args, timeout = 8000) => { try { return execFileSync('/usr/bin/osascript', args, { stdio: 'pipe', timeout }).toString().trim() } catch { return null } }
const JXA_WINDOWS = `ObjC.import('CoreGraphics');const a=ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo(17,0)));JSON.stringify(a.filter(w=>w.kCGWindowLayer===0&&w.kCGWindowBounds.Width>200&&w.kCGWindowBounds.Height>150).map(w=>({id:w.kCGWindowNumber,app:w.kCGWindowOwnerName,title:w.kCGWindowName||'',w:w.kCGWindowBounds.Width,h:w.kCGWindowBounds.Height})))`
function listWindows() { const o = osa(['-l', 'JavaScript', '-e', JXA_WINDOWS]); try { return JSON.parse(o ?? '[]') } catch { return [] } }
const JXA_SCREEN = `ObjC.import('AppKit');const s=$.NSScreen.mainScreen;const f=s.frame,v=s.visibleFrame;JSON.stringify({x:v.origin.x,y:f.size.height-v.origin.y-v.size.height,w:v.size.width,h:v.size.height})`
function screenFrame() { try { return JSON.parse(osa(['-l', 'JavaScript', '-e', JXA_SCREEN]) ?? '') } catch { return { x: 0, y: 25, w: 1440, h: 875 } } }
const EDITOR_RE = /^(EffectCraft|Adobe After Effects)/i
const studioUrl = (jobId) => `${cfg().server}/studio/live${UUID_RE.test(String(jobId ?? '')) ? `?job=${jobId}` : ''}` // seul un identifiant valide entre dans l'adresse

function openStudio(jobId) {
  if (NO_WINDOWS || platform() !== 'darwin') return false
  const url = studioUrl(jobId)
  try {
    if (existsSync(CHROME)) execFileSync('/usr/bin/open', ['-na', 'Google Chrome', '--args', `--app=${url}`], { stdio: 'ignore' })
    else execFileSync('/usr/bin/open', [url], { stdio: 'ignore' })
    return true
  } catch (e) { log('open-studio', e.message); return false }
}

/** Range les fenêtres : Flow Studio à gauche (35 %), à droite le logiciel de montage et/ou la page locale, chacun à sa place. */
function tileWindows(run) {
  if (NO_WINDOWS || platform() !== 'darwin') return
  const F = screenFrame()
  const wins = listWindows()
  const editor = wins.find((w) => EDITOR_RE.test(w.app))
  const hasSite = !!run?.siteUrl
  const lw = Math.round(F.w * 0.35)
  const R = { x: F.x + lw, y: F.y, w: F.w - lw, h: F.h }
  const boxes = { panel: [F.x, F.y, F.x + lw, F.y + F.h] }
  if (editor && hasSite) { boxes.editor = [R.x, R.y, R.x + R.w, R.y + Math.round(R.h / 2)]; boxes.site = [R.x, R.y + Math.round(R.h / 2), R.x + R.w, R.y + R.h] }
  else if (editor) boxes.editor = [R.x, R.y, R.x + R.w, R.y + R.h]
  else if (hasSite) boxes.site = [R.x, R.y, R.x + R.w, R.y + R.h]
  const b = (k) => `{${boxes[k].join(', ')}}`
  if (existsSync(CHROME)) {
    const siteHost = hasSite ? new URL(run.siteUrl).host : '__none__'
    osa(['-e', `tell application "Google Chrome"
repeat with w in windows
try
set u to URL of active tab of w
if u contains "/studio/live" then set bounds of w to ${b('panel')}
${boxes.site ? `if u contains "${siteHost}" and u does not contain "/studio/live" then set bounds of w to ${b('site')}` : ''}
end try
end repeat
end tell`])
  }
  if (editor && boxes.editor) { // demande l'accès « Accessibilité » une fois ; sans lui, la fenêtre reste où elle est
    const [x1, y1, x2, y2] = boxes.editor
    osa(['-e', `tell application "System Events" to tell (first process whose name is "${editor.app}") to try
set position of window 1 to {${x1}, ${y1}}
set size of window 1 to {${x2 - x1}, ${y2 - y1}}
end try`])
  }
}

/** Page locale du site : on l'ouvre dans sa propre fenêtre (adresse locale uniquement) puis on range les fenêtres. */
function setPreviewUrl(run, url) {
  if (!LOCAL_URL.test(url) || run.siteUrl === url) return
  run.siteUrl = url
  void emit(run.job.id, { type: 'log', title: 'Aperçu du site', body: url })
  if (NO_WINDOWS || platform() !== 'darwin') return
  try {
    if (existsSync(CHROME)) osa(['-e', `tell application "Google Chrome" to make new window\ntell application "Google Chrome" to set URL of active tab of front window to "${url}"`])
    else execFileSync('/usr/bin/open', [url], { stdio: 'ignore' })
  } catch (e) { log('open-site', e.message) }
  setTimeout(() => tileWindows(run), 2500)
}

/* Captures : le pont envoie une image réduite toutes les 3 s si quelqu'un regarde Flow, sinon toutes les 15 s. */
const sleepMs = (n) => new Promise((r) => setTimeout(r, n))
let lastHash = {}
function captureWindow(id, dest) { try { execFileSync('/usr/sbin/screencapture', ['-x', '-o', '-l', String(id), '-t', 'jpg', dest], { stdio: 'ignore', timeout: 8000 }); execFileSync('/usr/bin/sips', ['-Z', '1100', '-s', 'format', 'jpeg', '-s', 'formatOptions', '55', dest], { stdio: 'ignore', timeout: 8000 }); return statSync(dest).size > 1000 } catch { return false } }
function captureUrl(url, dest) {
  if (!existsSync(CHROME)) return false
  try {
    const png = dest + '.png'
    execFileSync(path.join(CHROME, 'Contents/MacOS/Google Chrome'), ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1280,800', '--virtual-time-budget=2500', `--screenshot=${png}`, url], { stdio: 'ignore', timeout: 20000 })
    execFileSync('/usr/bin/sips', ['-Z', '1100', '-s', 'format', 'jpeg', '-s', 'formatOptions', '55', png, '--out', dest], { stdio: 'ignore', timeout: 8000 })
    try { rmSync(png) } catch {}
    return statSync(dest).size > 1000
  } catch { return false }
}
async function sendPreview(jobId, slot, file, label) {
  const buf = readFileSync(file); const h = createHash('md5').update(buf).digest('hex')
  if (lastHash[`${jobId}:${slot}`] === h) return // rien n'a bougé
  lastHash[`${jobId}:${slot}`] = h
  const r = await api('POST', 'bridge/preview', { jobId, slot })
  await upload(r.upload, file, 'image/jpeg')
  await api('POST', 'bridge/preview', { jobId, slot, path: r.path, label })
}
async function previewLoop(run) {
  if (NO_WINDOWS && !process.env.FLOW_BRIDGE_PREVIEW_TEST) return
  const tmp = path.join(DIR, 'preview'); mkdirSync(tmp, { recursive: true })
  let tiled = ''
  while (!run.exited && !run.cancelled && !run.delivered) {
    try {
      const wins = listWindows()
      const editor = wins.filter((w) => EDITOR_RE.test(w.app)).sort((a, b) => b.w * b.h - a.w * a.h)[0]
      const sig = `${editor?.id ?? ''}|${run.siteUrl ?? ''}`
      if (sig !== tiled && sig !== '|') { tiled = sig; tileWindows(run) }
      if (editor) { const f = path.join(tmp, 'editor.jpg'); if (captureWindow(editor.id, f)) await sendPreview(run.job.id, 'editor', f, editor.app) }
      if (run.siteUrl) { const f = path.join(tmp, 'site.jpg'); if (captureUrl(run.siteUrl, f)) await sendPreview(run.job.id, 'site', f, run.siteUrl) }
    } catch (e) { log('preview', e.message) }
    await sleepMs(watching ? 3000 : 15000)
  }
}
let watching = false

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
  const run = jobId ? runs.get(jobId) : undefined
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
    } else if (type === 'setup') {
      if (payload?.action === 'open_studio') { const r = [...runs.values()].find((x) => !x.exited); openStudio(r?.job.id ?? payload.component); if (r) setTimeout(() => tileWindows(r), 3000); return }
      await doSetupCommand(payload ?? {})
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

/** Mise à jour automatique : le pont se met à jour tout seul depuis Flow (même adresse HTTPS que l'installation), jamais pendant un travail. */
async function selfUpdate() {
  const c = cfg()
  if (c.autoUpdate === false || FAKE_ENV() || path.dirname(SELF) !== DIR || !urlOk(c.server) || busy()) return
  try {
    const res = await fetch(`${c.server}/studio/flow-bridge.mjs`, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) return
    const text = await res.text()
    const v = /const VERSION = '([\d.]+)'/.exec(text)?.[1]
    const num = (x) => x.split('.').map(Number).reduce((a, n) => a * 1000 + n, 0)
    if (!v || num(v) <= num(VERSION) || text.length < 20_000 || !text.includes('selfUpdate')) return
    const tmp = path.join(DIR, 'flow-bridge.new.mjs')
    writeFileSync(tmp, text, { mode: 0o600 })
    execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe', timeout: 15000 }) // le fichier doit être valide avant de remplacer
    renameSync(tmp, SELF)
    log('mise à jour', VERSION, '->', v)
    process.exit(0) // launchd relance la nouvelle version
  } catch (e) { log('update', e.message) }
}

const pending = []
async function loop() {
  const c = cfg()
  if (!c.deviceToken) { console.error('Ce Mac n\'est pas relié. Lance :  node flow-bridge.mjs connect'); process.exit(1) }
  log('bridge démarré', VERSION, c.server)
  void refreshScan()
  setInterval(() => { if (!setupState.installing) void refreshScan() }, 10 * 60_000)
  setTimeout(() => void selfUpdate(), 20_000); setInterval(() => void selfUpdate(), 3 * 3600_000)
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
      watching = out.watch === true
      for (const cmd of [...pending.splice(0), ...out.commands]) await handle(cmd)
    } catch (e) {
      if (e.status === 401) { console.error('Jeton refusé : relie à nouveau ce Mac (connect).'); log('401'); await sleep(15000) }
      else log('poll', e.message)
    }
    await sleep(busy() ? 1500 : 2500)
  }
}

/* ───────── Logiciels du Mac : détection, installation guidée, état affiché sur Flow et dans le Terminal ───────── */
const FAKE = process.env.FLOW_BRIDGE_FAKE === '1'
const OWN_BIN = [path.join(DIR, 'node', 'bin'), path.join(DIR, 'npm', 'bin'), path.join(DIR, 'bin')]
const TOOL_ENV = () => ({ ...process.env, PATH: `${OWN_BIN.join(':')}:/opt/homebrew/bin:/usr/local/bin:${HOME}/.local/bin:${HOME}/.claude/local:${process.env.PATH ?? ''}` })
const sh = (cmd, args = [], timeout = 20000) => { try { return execFileSync(cmd, args, { stdio: 'pipe', timeout, env: TOOL_ENV() }).toString().trim() } catch { return null } }
const which = (c) => sh('/bin/sh', ['-c', `command -v ${c}`])
const APP_DIRS = [ '/Applications', path.join(HOME, 'Applications') ]
const findApp = (re) => { for (const d of APP_DIRS) { try { const hit = readdirSync(d).filter((n) => re.test(n)).sort().pop(); if (hit) return path.join(d, hit) } catch {} } return null }
const plistVersion = (app) => sh('/usr/bin/defaults', ['read', path.join(app, 'Contents', 'Info'), 'CFBundleShortVersionString'])
const SKILLS = ['effectcraft', 'motion-reference-clone', 'analyse-image', 'decoupage-reference']
const fakeDone = new Set()

function scan() {
  const c = cfg()
  const out = []
  const add = (x) => out.push(x)
  const nodeMajor = Number(process.versions.node.split('.')[0])
  add({ id: 'node', name: 'Node.js', group: 'outils', required: true, state: nodeMajor >= 20 ? 'ok' : 'warn', version: process.versions.node, detail: nodeMajor >= 20 ? undefined : 'Version 20 ou plus requise.', installable: !!which('brew') })
  // Claude Code
  const claudeBin = c.claudeBin === 'node' ? 'node' : resolveClaude('claude')
  const cv = c.claudeBin === 'node' ? 'test' : sh(claudeBin, ['--version'])
  if (!cv && !fakeDone.has('claude')) add({ id: 'claude', name: 'Claude Code', group: 'ia', required: true, state: 'missing', cost: 'paid', detail: 'Il faut un abonnement Claude (Pro ou Max).', installable: true })
  else {
    const logged = c.claudeBin === 'node' || fakeDone.has('claude-login') || claudeOk(true)
    add({ id: 'claude', name: 'Claude Code', group: 'ia', required: true, state: logged ? 'ok' : 'warn', version: cv ?? undefined, cost: 'paid', detail: logged ? undefined : 'Installé mais pas connecté à ton compte Claude.', installable: true, note: logged ? undefined : 'login' })
  }
  // Moteurs de motion design
  const ec = findApp(/^EffectCraft\.app$/) ?? (fakeDone.has('effectcraft') ? '/Applications/EffectCraft.app' : null)
  add({ id: 'effectcraft', name: 'EffectCraft', group: 'motion', state: ec ? 'ok' : 'missing', cost: 'free', version: ec && !FAKE ? plistVersion(ec) ?? undefined : undefined, detail: ec ? undefined : 'Gratuit, open source. Alternative à After Effects.', installable: true })
  const ae = findApp(/^Adobe After Effects.*$/)
  const ccApp = findApp(/^Adobe Creative Cloud$/)
  add({ id: 'aftereffects', name: 'After Effects', group: 'motion', state: ae ? 'ok' : 'missing', cost: 'paid', version: ae ? path.basename(ae).replace('Adobe After Effects ', '') : undefined,
    detail: ae ? 'Installé. Une licence Adobe active (abonnement ou essai) est nécessaire : elle ne peut pas être vérifiée automatiquement.' : 'Nécessite un abonnement Adobe payant (essai gratuit de 7 jours possible). Installation guidée via Creative Cloud.', installable: true, note: ccApp ? 'cc' : undefined })
  const rem = existsSync(path.join(c.atelier, 'remotion-base', 'node_modules', 'remotion')) || existsSync(path.join(c.atelier, 'node_modules', 'remotion')) || fakeDone.has('remotion')
  add({ id: 'remotion', name: 'Remotion', group: 'motion', state: rem ? 'ok' : 'missing', cost: 'free', detail: rem ? undefined : 'Gratuit (jusqu\'à 3 personnes). Vidéos fabriquées par du code.', installable: true })
  // Outils
  const ff = which('ffmpeg')
  add({ id: 'ffmpeg', name: 'ffmpeg', group: 'outils', required: true, state: ff || fakeDone.has('ffmpeg') ? 'ok' : 'missing', detail: ff ? undefined : 'Planches d\'images, sons et assemblage.', installable: !!which('brew') })
  const py = sh('python3', ['-c', 'import numpy, PIL; print("ok")'])
  add({ id: 'python', name: 'Python (numpy, Pillow)', group: 'outils', state: py === 'ok' || fakeDone.has('python') ? 'ok' : which('python3') ? 'warn' : 'missing', detail: py === 'ok' ? undefined : 'Mesures d\'images (couleurs, positions).', installable: !!which('python3') })
  const sk = SKILLS.filter((n) => existsSync(path.join(HOME, '.claude', 'skills', n, 'SKILL.md')))
  add({ id: 'skills', name: 'Méthodes de motion (skills)', group: 'ia', required: true, state: sk.length === SKILLS.length || fakeDone.has('skills') ? 'ok' : 'missing', detail: sk.length === SKILLS.length ? undefined : `${sk.length}/${SKILLS.length} installées`, installable: true })
  // Sites
  const vc = which('vercel')
  const vlog = vc ? sh('vercel', ['whoami'], 20000) : null
  add({ id: 'vercel', name: 'Vercel (mise en ligne des sites)', group: 'site', state: vc ? (vlog ? 'ok' : 'warn') : 'missing', version: vlog ?? undefined, detail: vc ? (vlog ? undefined : 'Installé mais pas connecté : lance « vercel login » dans le Terminal.') : 'Pour publier les sites.', installable: true })
  const gh = which('gh'); const ghOk = gh ? sh('gh', ['auth', 'status']) !== null : false
  add({ id: 'github', name: 'GitHub', group: 'site', state: ghOk ? 'ok' : 'warn', detail: ghOk ? undefined : (gh ? 'Pas connecté : bouton « Connecter » dans Paramètres > Studio.' : 'Facultatif : pour ranger le code dans ton compte.'), installable: false })
  const sb = which('supabase'); const sbOk = sb ? sh('supabase', ['projects', 'list'], 20000) !== null : false
  add({ id: 'supabase', name: 'Supabase', group: 'site', state: sbOk ? 'ok' : 'warn', detail: sbOk ? undefined : (sb ? 'Pas connecté : bouton « Connecter » dans Paramètres > Studio.' : 'Facultatif : pour les sites avec base de données.'), installable: false })
  add({ id: 'git', name: 'Git', group: 'site', state: which('git') ? 'ok' : 'missing', installable: false, detail: which('git') ? undefined : 'Installe les outils de développement Apple : xcode-select --install' })
  if (FAKE && process.env.FLOW_FAKE_MISSING) for (const id of process.env.FLOW_FAKE_MISSING.split(',')) { const x = out.find((c) => c.id === id); if (x && !fakeDone.has(id)) { x.state = 'missing'; x.version = undefined } }
  return out
}

let setupState = { components: [], installing: null, engine: cfgEngine(), platform: platform() }
function cfgEngine() { return readJson(CONFIG, {}).engine ?? null }
const COLORS = { ok: '\x1b[32m', missing: '\x1b[31m', warn: '\x1b[33m', error: '\x1b[31m', installing: '\x1b[36m', waiting: '\x1b[36m' }
const ICON = { ok: '✔', missing: '✘', warn: '!', error: '✘', installing: '…', waiting: '…' }
function printState(st = setupState) {
  if (!process.stdout.isTTY) return
  const by = { ia: 'Intelligence', motion: 'Motion design (au moins un moteur)', outils: 'Outils', site: 'Sites web' }
  for (const g of ['ia', 'motion', 'outils', 'site']) {
    console.log(`\n  \x1b[1m${by[g]}\x1b[0m`)
    for (const x of st.components.filter((c) => c.group === g)) console.log(`   ${COLORS[x.state] ?? ''}${ICON[x.state] ?? '?'}\x1b[0m ${x.name.padEnd(34)} ${x.version ?? ''}${x.cost === 'paid' ? '  \x1b[33m(payant)\x1b[0m' : x.cost === 'free' ? '  \x1b[32m(gratuit)\x1b[0m' : ''}${x.detail && x.state !== 'ok' ? `\n       \x1b[2m${x.detail}\x1b[0m` : ''}`)
  }
  console.log('')
}
let lastSetupPost = 0
async function postSetup(force = false) {
  if (!cfg().deviceToken) return
  const now = Date.now()
  if (!force && now - lastSetupPost < 900) return
  lastSetupPost = now
  try { await api('POST', 'bridge/setup', setupState) } catch (e) { log('setup', e.message) }
}
async function refreshScan({ post = true } = {}) {
  setupState = { ...setupState, components: scan(), engine: cfgEngine(), platform: platform() }
  if (post) await postSetup(true)
  return setupState
}
function progress(id, label, step, pct, line) {
  const inst = setupState.installing && setupState.installing.id === id ? setupState.installing : { id, label, step: '', pct: 0, log: [] }
  inst.step = step; inst.pct = Math.max(0, Math.min(100, Math.round(pct))); if (line) inst.log = [...inst.log, line].slice(-12)
  setupState.installing = inst
  setupState.components = setupState.components.map((c) => (c.id === id ? { ...c, state: 'installing', detail: step } : c))
  if (GUI_MODE) gui({ phase: 'install', step: `${label} — ${step}`, pct: guiPct(guiRange[0], guiRange[1], inst.pct) })
  if (process.stdout.isTTY) process.stdout.write(`\r\x1b[K   ${COLORS.installing}…\x1b[0m ${label} — ${step} (${inst.pct} %)`)
  void postSetup()
  log('install', id, step, inst.pct)
}
function run(cmd, args, { cwd, onLine, timeout = 20 * 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    const ch = spawn(cmd, args, { cwd, env: TOOL_ENV(), stdio: ['ignore', 'pipe', 'pipe'] })
    let tail = ''
    const feed = (d) => { for (const l of d.toString().split(/\r?\n/)) { if (l.trim()) { tail = (tail + '\n' + l).slice(-1500); onLine?.(l) } } }
    ch.stdout.on('data', feed); ch.stderr.on('data', feed)
    const t = setTimeout(() => { ch.kill('SIGTERM'); reject(new Error('délai dépassé')) }, timeout)
    ch.on('error', (e) => { clearTimeout(t); reject(e) })
    ch.on('exit', (code) => { clearTimeout(t); code === 0 ? resolve(tail) : reject(new Error(`code ${code} : ${short(tail, 300)}`)) })
  })
}
async function downloadTo(url, dest, onPct) {
  if (!urlOk(url)) throw new Error('adresse de téléchargement refusée')
  const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'flow-bridge' }, signal: AbortSignal.timeout(30 * 60_000) })
  if (!res.ok) throw new Error(`téléchargement ${res.status}`)
  const total = Number(res.headers.get('content-length') ?? 0)
  const out = (await import('node:fs')).createWriteStream(dest)
  let got = 0
  for await (const chunk of res.body) { out.write(chunk); got += chunk.length; if (total) onPct?.(got / total) }
  await new Promise((r) => out.end(r))
}

const INSTALLERS = {
  async effectcraft(rp) {
    rp('Recherche de la dernière version', 5)
    const rel = await (await fetch('https://api.github.com/repos/storytold/effectcraft/releases/latest', { headers: { 'user-agent': 'flow-bridge', accept: 'application/vnd.github+json' } })).json()
    const asset = (rel.assets ?? []).find((a) => /macos-universal\.dmg$/i.test(a.name))
    if (!asset) throw new Error('Aucun installateur macOS trouvé dans la dernière version.')
    const dl = path.join(DIR, 'downloads'); mkdirSync(dl, { recursive: true })
    const dmg = path.join(dl, asset.name)
    await downloadTo(asset.browser_download_url, dmg, (f) => rp(`Téléchargement ${asset.name}`, 8 + f * 70))
    rp('Vérification de la somme de contrôle', 78)
    const sums = (rel.assets ?? []).find((a) => /^SHA256SUMS(\.txt)?$/i.test(a.name))
    if (sums) {
      const txt = await (await fetch(sums.browser_download_url, { headers: { 'user-agent': 'flow-bridge' } })).text()
      const want = txt.split('\n').map((l) => l.trim().split(/\s+/)).find((p) => p[1]?.replace(/^\*/, '') === asset.name)?.[0]
      const got = (await import('node:crypto')).createHash('sha256').update(readFileSync(dmg)).digest('hex')
      if (want && want.toLowerCase() !== got) { try { rmSync(dmg) } catch {}; throw new Error('Somme de contrôle incorrecte : fichier refusé.') }
    }
    rp('Ouverture de l\'image disque', 80)
    const mount = path.join(DIR, 'mnt'); mkdirSync(mount, { recursive: true })
    await run('/usr/bin/hdiutil', ['attach', dmg, '-nobrowse', '-readonly', '-mountpoint', mount])
    try {
      const app = readdirSync(mount).find((n) => n.endsWith('.app'))
      if (!app) throw new Error('Application introuvable dans l\'image disque.')
      let target = '/Applications'
      rp('Copie dans Applications', 88)
      try { await run('/usr/bin/ditto', [path.join(mount, app), path.join(target, app)]) } catch { target = path.join(HOME, 'Applications'); mkdirSync(target, { recursive: true }); await run('/usr/bin/ditto', [path.join(mount, app), path.join(target, app)]) }
      await run('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', path.join(target, app)]).catch(() => {})
    } finally { await run('/usr/bin/hdiutil', ['detach', mount, '-force']).catch(() => {}) }
    try { rmSync(dmg) } catch {}
    rp('Terminé', 100)
  },
  async aftereffects(rp) {
    rp('Ouverture de la page de téléchargement Adobe Creative Cloud', 30)
    await run('/usr/bin/open', ['https://creativecloud.adobe.com/apps/download/creative-cloud']).catch(() => {})
    rp('Installe Creative Cloud, connecte-toi (abonnement After Effects ou essai de 7 jours), puis installe After Effects. Ce Mac détecte ensuite l\'installation tout seul.', 60)
    const e = new Error('guidée'); e.guided = true; throw e
  },
  async remotion(rp) {
    const c = cfg(); mkdirSync(c.atelier, { recursive: true })
    rp('Création du projet Remotion', 10)
    await run('npx', ['--yes', 'create-video@latest', '--yes', '--blank', 'remotion-base'], { cwd: c.atelier, onLine: (l) => rp(short(l, 70), Math.min(90, (setupState.installing?.pct ?? 10) + 1)) })
    rp('Terminé', 100)
  },
  async claude(rp) {
    rp('Installation de Claude Code', 15)
    try { await run('npm', ['install', '-g', '--prefix', path.join(DIR, 'npm'), '@anthropic-ai/claude-code'], { onLine: (l) => rp(short(l, 70), Math.min(85, (setupState.installing?.pct ?? 15) + 1)) }) }
    catch { rp('Nouvel essai avec l\'installateur officiel', 50); await run('/bin/sh', ['-c', 'curl -fsSL https://claude.ai/install.sh | bash']) }
    claudeResolved = null; claudeCache = { at: 0, ok: false }
    rp('Terminé : il reste à te connecter à ton compte', 100)
  },
  async ffmpeg(rp) {
    if (which('brew')) { rp('Installation (Homebrew)', 20); await run('brew', ['install', 'ffmpeg'], { onLine: (l) => rp(short(l, 70), Math.min(90, (setupState.installing?.pct ?? 20) + 1)) }); rp('Terminé', 100); return }
    rp('Installation sans Homebrew (ffmpeg-static)', 20)
    const tools = path.join(DIR, 'tools'); mkdirSync(tools, { recursive: true }); mkdirSync(path.join(DIR, 'bin'), { recursive: true })
    await run('npm', ['install', '--prefix', tools, 'ffmpeg-static', 'ffprobe-static'], { onLine: (l) => rp(short(l, 70), Math.min(90, (setupState.installing?.pct ?? 20) + 1)) })
    const ff = path.join(tools, 'node_modules', 'ffmpeg-static', 'ffmpeg'), fp = readdirSync(path.join(tools, 'node_modules', 'ffprobe-static', 'bin', 'darwin')).map((a) => path.join(tools, 'node_modules', 'ffprobe-static', 'bin', 'darwin', a, 'ffprobe')).find((f) => existsSync(f))
    for (const [src, name] of [[ff, 'ffmpeg'], [fp, 'ffprobe']]) { if (!src || !existsSync(src)) continue; const dst = path.join(DIR, 'bin', name); try { rmSync(dst) } catch {}; (await import('node:fs')).symlinkSync(src, dst) }
    rp('Terminé', 100)
  },
  async node(rp) { if (!which('brew')) throw new Error('Installe Node.js depuis https://nodejs.org (version LTS).'); rp('Mise à jour (Homebrew)', 20); await run('brew', ['install', 'node'], { onLine: (l) => rp(short(l, 70), 60) }); rp('Terminé', 100) },
  async python(rp) { rp('Installation de numpy et Pillow', 30); try { await run('python3', ['-m', 'pip', 'install', '--user', 'numpy', 'pillow']) } catch { await run('python3', ['-m', 'pip', 'install', '--user', '--break-system-packages', 'numpy', 'pillow']) } rp('Terminé', 100) },
  async vercel(rp) { rp('Installation de la CLI Vercel', 30); await run('npm', ['install', '-g', 'vercel']); rp('Installée : connecte-la avec « vercel login » dans le Terminal', 100) },
  async skills(rp) {
    const c = cfg()
    rp('Lecture de la liste', 10)
    const man = await (await fetch(`${c.server}/studio/skills/manifest.json`)).json()
    const dl = path.join(DIR, 'downloads'); mkdirSync(dl, { recursive: true }); const dest = path.join(HOME, '.claude', 'skills'); mkdirSync(dest, { recursive: true })
    let i = 0
    for (const name of man.skills) {
      const f = path.join(dl, `${name}.tgz`)
      rp(`Téléchargement de ${name}`, 15 + (i / man.skills.length) * 75)
      await downloadTo(`${c.server}/studio/skills/${name}.tgz`, f)
      const listing = (sh('/usr/bin/tar', ['-tzf', f]) ?? '').split('\n').map((x) => x.trim()).filter(Boolean)
      if (!/^[a-z0-9-]+$/i.test(name) || listing.some((x) => x.startsWith('/') || x.split('/').includes('..') || !(x === `${name}/` || x.startsWith(`${name}/`)))) throw new Error(`archive ${name} refusée (chemins suspects)`)
      await run('/usr/bin/tar', ['-xzf', f, '-C', dest]); try { rmSync(f) } catch {}
      i++
    }
    rp('Terminé', 100)
  },
}

async function installComponent(id, { choice } = {}) {
  const comp = setupState.components.find((c) => c.id === id)
  const label = comp?.name ?? id
  const fn = INSTALLERS[id]
  if (!fn) { setupState.components = setupState.components.map((c) => (c.id === id ? { ...c, state: 'error', detail: 'Installation automatique impossible.' } : c)); await postSetup(true); return false }
  progress(id, label, 'Démarrage', 2)
  const rp = (step, pct) => progress(id, label, step, pct, step)
  try {
    if (FAKE) { for (const [i, s] of ['Préparation', 'Téléchargement', 'Installation', 'Vérification'].entries()) { rp(s, 10 + i * 25); await sleep(120) }; fakeDone.add(id) }
    else await fn(rp)
    setupState.installing = null
    if (id === 'effectcraft' || id === 'aftereffects' || id === 'remotion') { const c = readJson(CONFIG, {}); c.engine = choice || c.engine || id; saveCfg(c) }
    await refreshScan()
    if (process.stdout.isTTY) process.stdout.write(`\r\x1b[K   ${COLORS.ok}✔\x1b[0m ${label} installé\n`)
    return true
  } catch (e) {
    const guided = e.guided
    setupState.installing = null
    setupState.components = setupState.components.map((c) => (c.id === id ? { ...c, state: guided ? 'waiting' : 'error', detail: guided ? (inst_guided_text(id)) : short(e.message, 200) } : c))
    await postSetup(true)
    if (process.stdout.isTTY) process.stdout.write(`\r\x1b[K   ${guided ? COLORS.waiting + '…' : COLORS.error + '✘'}\x1b[0m ${label} : ${guided ? 'installation guidée en cours' : short(e.message, 160)}\n`)
    return false
  }
}
const inst_guided_text = (id) => (id === 'aftereffects' ? 'Termine l\'installation dans Creative Cloud (abonnement After Effects requis) : ce Mac détectera After Effects tout seul.' : 'Action manuelle nécessaire.')

async function loginClaude() {
  progress('claude', 'Claude Code', 'Connexion à ton compte Claude : termine dans le navigateur qui s\'ouvre', 40)
  const child = spawn(FAKE || cfg().claudeBin === 'node' ? 'true' : resolveClaude('claude'), ['auth', 'login'], { env: TOOL_ENV(), stdio: 'ignore', detached: false })
  child.on('error', () => {})
  const t0 = Date.now()
  while (Date.now() - t0 < 10 * 60_000) { await sleep(3000); if (FAKE || claudeOk(true)) break }
  try { child.kill() } catch {}
  if (FAKE) fakeDone.add('claude-login')
  setupState.installing = null
  await refreshScan()
}

/** Connexion à un compte (Vercel, GitHub, Supabase) : une fenêtre Terminal s'ouvre sur le Mac avec la commande de connexion, l'utilisateur la suit dans son navigateur. */
const LOGIN_CMD = {
  vercel: '(command -v vercel >/dev/null || npm i -g vercel) && vercel login',
  github: '(command -v gh >/dev/null || brew install gh) && gh auth login --web --git-protocol https',
  supabase: '(command -v supabase >/dev/null || brew install supabase/tap/supabase) && supabase login',
}
function loginInTerminal(id) {
  const cmd = Object.hasOwn(LOGIN_CMD, id) ? LOGIN_CMD[id] : null
  if (!cmd || platform() !== 'darwin' || FAKE) return false
  const line = `export PATH="${OWN_BIN.join(':')}:/opt/homebrew/bin:/usr/local/bin:$PATH"; clear; echo "Flow Studio — connexion ${id}"; ${cmd}; echo; echo "Terminé. Tu peux fermer cette fenêtre."`
  osa(['-e', `tell application "Terminal"\nactivate\ndo script ${JSON.stringify(line)}\nend tell`])
  for (const mins of [0.5, 1, 2, 4, 8]) setTimeout(() => { if (!setupState.installing) void refreshScan() }, mins * 60_000) // l'état se met à jour tout seul sur Flow
  return true
}
async function doSetupCommand(p) {
  if (p.action === 'rescan') { await refreshScan(); return }
  if (p.action === 'login' && typeof p.component === 'string' && Object.hasOwn(LOGIN_CMD, p.component)) { loginInTerminal(p.component); return }
  if (p.action === 'login' && (p.component === 'claude' || !p.component)) { await loginClaude(); return }
  if (p.action === 'install' && p.component) {
    if (!setupState.components.length) await refreshScan({ post: false })
    await installComponent(p.component, { choice: p.choice })
  }
}

/* Assistant de configuration dans le Terminal : montre l'état, propose et installe. */
async function ask(q, def) { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); const a = await new Promise((r) => rl.question(q, r)); rl.close(); return (a.trim() || def || '').toLowerCase() }
async function wizard({ yes = false } = {}) {
  console.log('\n  \x1b[1mFlow Studio — vérification de ce Mac\x1b[0m')
  await refreshScan({ post: false })
  printState()
  const comps = () => setupState.components
  const motionOk = () => comps().some((c) => ['effectcraft', 'aftereffects', 'remotion'].includes(c.id) && c.state === 'ok')
  const interactive = process.stdin.isTTY && !yes
  // 1. moteur de motion design
  if (!motionOk()) {
    console.log('  Aucun moteur de motion design trouvé. Choisis :')
    console.log('   1) EffectCraft          gratuit, recommandé (installation automatique)')
    console.log('   2) After Effects         \x1b[33mabonnement Adobe payant\x1b[0m (essai gratuit 7 jours) — installation guidée')
    console.log('   3) Remotion              gratuit, vidéos par code (installation automatique)')
    console.log('   4) Plus tard')
    const c = interactive ? await ask('  Ton choix [1] : ', '1') : '1'
    const id = { 1: 'effectcraft', 2: 'aftereffects', 3: 'remotion' }[c]
    if (id) await installComponent(id, { choice: id })
  }
  // 2. composants requis ou utiles manquants
  const wanted = comps().filter((c) => (c.required || ['python'].includes(c.id)) && c.state !== 'ok' && c.installable !== false)
  for (const c of wanted) {
    const a = interactive ? await ask(`  Installer ${c.name} maintenant ? [O/n] `, 'o') : 'o'
    if (a.startsWith('o') || a === 'y') await installComponent(c.id)
  }
  // 3. Claude connecté ?
  const cl = comps().find((c) => c.id === 'claude')
  if (cl && cl.state === 'warn') {
    const a = interactive ? await ask('  Se connecter à Claude maintenant ? [O/n] ', 'o') : 'o'
    if (a.startsWith('o') || a === 'y') await loginClaude()
  }
  await refreshScan({ post: false })
  console.log('\n  \x1b[1mRésultat\x1b[0m'); printState()
  const opt = comps().filter((c) => c.state !== 'ok' && !c.required && c.group !== 'motion')
  if (opt.length) console.log(`  Facultatifs encore à installer : ${opt.map((c) => c.name).join(', ')} (depuis Flow > Création de site > Connexion du Mac).\n`)
}


/* ───────── Mode graphique : l'application « Installer Flow Studio » lit gui.txt et répond par gui-answer.txt ───────── */
const GUI_FILE = path.join(DIR, 'gui.txt'), GUI_ANS = path.join(DIR, 'gui-answer.txt')
let GUI_MODE = false, guiData = { phase: 'start', step: '', pct: 0 }, guiRange = [0, 100]
function gui(patch) {
  Object.assign(guiData, patch)
  const body = Object.entries(guiData).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${k}=${String(v).replace(/[\r\n]+/g, ' ')}`).join('\n')
  try { writeFileSync(GUI_FILE, body + '\n', { mode: 0o600 }) } catch {}
}
async function guiAsk(id, text, options) {
  try { rmSync(GUI_ANS) } catch {}
  gui({ ask: `${id}|${text}|${options.map((o) => `${o.label}~${o.value}`).join(';;')}` })
  const t0 = Date.now()
  while (Date.now() - t0 < 30 * 60_000) { await sleep(700); try { const l = readFileSync(GUI_ANS, 'utf8').trim(); if (l.startsWith(`${id}=`)) { gui({ ask: '' }); try { rmSync(GUI_ANS) } catch {}; return l.slice(id.length + 1) } } catch {} }
  gui({ ask: '' }); return null
}
const guiPct = (a, b, p) => Math.round(a + ((b - a) * p) / 100)

async function guiSetup() {
  GUI_MODE = true
  const issues = []
  try {
    gui({ phase: 'scan', step: 'Vérification de ton Mac…', pct: 3, error: '', code: '', url: '' })
    await refreshScan({ post: false })
    const comps = () => setupState.components
    const state = (id) => comps().find((c) => c.id === id)?.state
    const motionOk = () => comps().some((c) => ['effectcraft', 'aftereffects', 'remotion'].includes(c.id) && c.state === 'ok')
    // 1. moteur de motion design
    if (!motionOk()) {
      const choice = await guiAsk('engine', 'Aucun moteur de motion design trouvé. Lequel veux-tu installer ?', [
        { label: 'EffectCraft — gratuit (recommandé)', value: 'effectcraft' },
        { label: 'After Effects — abonnement Adobe payant', value: 'aftereffects' },
        { label: 'Remotion — gratuit, vidéos par code', value: 'remotion' },
      ])
      guiRange = [8, 40]
      if (choice) { const ok = await installComponent(choice, { choice }); if (!ok && choice !== 'aftereffects') issues.push(`${choice} non installé`) }
    }
    // 2. le reste, sans poser de question
    const todo = comps().filter((c) => c.state !== 'ok' && c.installable !== false && ['claude', 'skills', 'ffmpeg', 'python'].includes(c.id) && !(c.id === 'claude' && c.state === 'warn'))
    let i = 0
    for (const c of todo) {
      guiRange = [40 + (i * 30) / Math.max(1, todo.length), 40 + ((i + 1) * 30) / Math.max(1, todo.length)]
      gui({ phase: 'install', step: `Installation de ${c.name}…`, pct: Math.round(guiRange[0]) })
      const ok = await installComponent(c.id)
      if (!ok && ['claude', 'skills'].includes(c.id)) issues.push(`${c.name} non installé`)
      i++
    }
    // 3. Claude connecté
    await refreshScan({ post: false })
    if (state('claude') === 'warn') {
      guiRange = [70, 80]
      gui({ phase: 'login', step: 'Connecte-toi à ton compte Claude dans la page du navigateur qui s’ouvre…', pct: 72 })
      await loginClaude()
      await refreshScan({ post: false })
      if (state('claude') !== 'ok') issues.push('Claude Code n’est pas connecté')
    }
    // 4. liaison avec Flow : le code est confirmé automatiquement dans la page ouverte par l'application
    const c = cfg()
    if (!c.deviceToken) {
      gui({ phase: 'pair', step: 'Liaison avec ton compte Flow…', pct: 82 })
      const info = { deviceName: process.env.FLOW_DEVICE_NAME || hostname().replace(/\.local$/, ''), os: 'macOS', version: VERSION }
      const res = await api('POST', 'pair/start', info, { auth: false })
      gui({ phase: 'pair', step: 'Confirme la liaison dans la page Flow qui vient de s’ouvrir (connecte-toi si besoin).', pct: 85, code: res.code, url: `${c.server}/studio/connect#code=${res.code}` })
      const t0 = Date.now(); let paired = false
      while (Date.now() - t0 < res.expiresInSec * 1000) {
        await sleep(2500)
        const r = await api('GET', `pair/poll?token=${encodeURIComponent(res.pollToken)}`, undefined, { auth: false }).catch(() => null)
        if (r?.status === 'paired') { saveCfg({ ...readJson(CONFIG, {}), server: c.server, deviceToken: r.deviceToken }); paired = true; break }
        if (r?.status === 'expired') break
      }
      if (!paired) throw new Error('La liaison n’a pas été confirmée à temps. Relance l’installateur.')
    }
    // 5. démarrage automatique
    gui({ phase: 'service', step: 'Activation du démarrage automatique…', pct: 94, code: '', url: '' })
    install()
    await refreshScan()
    gui({ phase: 'done', step: issues.length ? `Terminé, avec des points à revoir : ${issues.join(' ; ')}` : 'Terminé : ton Mac est prêt.', pct: 100 })
  } catch (e) {
    gui({ phase: 'error', error: String(e.message ?? e).slice(0, 300) })
    log('gui-setup', e.message)
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
  if (FAKE) { log('install ignoré (mode test)'); return }
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
  makeStudioApp()
}
/** Petite application « Flow Studio » (dossier Applications de l'utilisateur) : un double-clic ouvre la fenêtre de suivi. */
function makeStudioApp() {
  if (FAKE || platform() !== 'darwin') return
  try {
    const app = path.join(HOME, 'Applications', 'Flow Studio.app')
    mkdirSync(path.dirname(app), { recursive: true })
    rmSync(app, { recursive: true, force: true })
    execFileSync('/usr/bin/osacompile', ['-o', app, '-e', `do shell script "'${process.execPath}' '${SELF}' open >/dev/null 2>&1 &"`], { stdio: 'ignore' })
    console.log('Application « Flow Studio » ajoutée dans ton dossier Applications.')
  } catch (e) { log('studio-app', e.message) }
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
else if (cmd === 'doctor') { await refreshScan({ post: false }); printState() }
else if (cmd === 'setup') { if (process.argv.includes('--gui')) await guiSetup(); else await wizard({ yes: process.argv.includes('--yes') }) }
else if (cmd === 'install') install()
else if (cmd === 'open') { if (!openStudio(process.argv[3])) openStudio() }
else if (cmd === 'uninstall') uninstall()
else if (cmd === 'logs') console.log(readdirSync(DIR).includes('bridge.log') ? readFileSync(LOG, 'utf8').split('\n').slice(-60).join('\n') : '(aucun journal)')
else console.log('Usage : node flow-bridge.mjs setup | doctor | connect | start | status | install | uninstall | logs\nVariables : FLOW_SERVER (adresse de Flow), FLOW_DEVICE_NAME, FLOW_BRIDGE_HOME')
