#!/usr/bin/env node
// Flow Bridge : relie ce Mac à Flow. Reçoit les demandes (motion design, sites), lance Claude Code dessus, envoie l'état,
// les questions et les résultats, et applique pause / reprise / annulation / messages venant de Flow.
// Aucune dépendance : Node 20+ seulement.  Usage :  node flow-bridge.mjs connect | start | status | install | uninstall | logs
import { spawn, execFile, execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { chmodSync, createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync, renameSync, appendFileSync, readdirSync, rmSync } from 'node:fs'
import { homedir, hostname, platform } from 'node:os'
import path from 'node:path'
import readline from 'node:readline'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'

const VERSION = '1.4.0'
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
  try { localApply(jobId, event) } catch { /* l'affichage local ne doit jamais bloquer */ }
  for (let i = 0; i < 4; i++) { try { await api('POST', 'bridge/event', { jobId, event }); return } catch (e) { if (e.status === 401 || e.status === 404) return; await sleep(1000 * (i + 1)) } }
}

/* ───────── État persistant ───────── */
const state = readJson(STATE, { jobs: {} })
const saveState = () => { writeFileSync(STATE, JSON.stringify(state), { mode: 0o600 }) }
const runs = new Map() // jobId -> processus en cours

/* ───────── Protocole donné à Claude (ajouté au prompt de Flow) ───────── */
const STEPS = {
  motion: ['receive', 'analyse', 'plan', 'build', 'compare', 'sound', 'render4k', 'verify'],
  site: ['interview', 'analyse', 'design', 'structure', 'build', 'data', 'polish', 'deploy', 'qa', 'motion', 'deliver'],
}
function protocol(kind, dir, spec = {}, extra = '') {
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
6. **Liste des tâches (affichée en direct à l'utilisateur)** : dès le début, écris \`todo.json\` : \`{"items":[{"text":"<tâche courte>","state":"todo"}]}\` avec TOUTES les tâches prévues (10 à 25). À chaque tâche commencée mets \`"doing"\`, terminée \`"done"\` (une seule « doing » à la fois), tout de suite, sans regrouper : l'avancement affiché est calculé sur ces cases. Ajoute les tâches nouvelles qui apparaissent.
7. **Aperçu en direct** : ${kind === 'site' ? "dès que le serveur local du site tourne, écris `preview.json` : `{\"site\":\"http://localhost:<port>\"}` (adresse locale uniquement). Le pont l'ouvre dans une fenêtre et la montre à l'utilisateur en direct ; relance-la (même fichier) si le port change." : "garde le logiciel de motion (EffectCraft / After Effects) ouvert avec la composition visible pendant tout le travail : le pont la montre à l'utilisateur en direct."}
8. **Ne t'arrête jamais** : tu ne finis ton tour qu'après la livraison. Une tâche longue (rendu, installation, build) : lance-la, puis surveille-la avec des attentes courtes (\`sleep 20\`) dans le même tour. N'attends jamais une réponse pour avancer : aucune réponse n'arrive sans que tu aies écrit QUESTION.json.
${extra}`
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
const DENY = ['Read(~/.ssh/**)', 'Read(~/.aws/**)', 'Read(~/.config/gh/**)', 'Read(~/.gnupg/**)', 'Read(~/.flow-bridge/**)', 'Read(~/Library/Keychains/**)', 'Read(~/Library/Application Support/Google/Chrome/**)', 'Edit(~/.flow-bridge/**)', 'Edit(~/.ssh/**)', 'Edit(~/.zshrc)', 'Edit(~/.zprofile)', 'Bash(sudo:*)', 'Bash(vercel remove:*)', 'Bash(vercel rm:*)', 'Bash(vercel project rm:*)', 'Bash(vercel project remove:*)', 'Bash(vercel domains rm:*)', 'Bash(vercel domains remove:*)', 'Bash(vercel env rm:*)', 'Bash(vercel deploy --force:*)', 'Bash(vercel --force:*)', 'Bash(vercel alias set:*)', 'Bash(vercel promote:*)', 'Bash(vercel rollback:*)', 'Bash(supabase projects delete:*)', 'Bash(gh repo delete:*)', 'Bash(rm -rf /:*)', 'Bash(rm -rf ~:*)', 'Bash(rm -rf $HOME:*)', 'Bash(cat ~/.flow-bridge/*:*)']
const GUARD_DIR = path.join(DIR, 'guard')
/** Garde exécutée par Claude Code AVANT chaque commande Bash : refuse toute commande Vercel qui vise un projet existant (liste figée au premier démarrage du projet). */
const GUARD_SCRIPT = `// Flow Studio : garde Vercel (ne jamais modifier un projet existant)
import { readFileSync } from 'node:fs'
import path from 'node:path'
const inp = (() => { try { return JSON.parse(readFileSync(0, 'utf8')) } catch { return {} } })()
const cmd = String(inp.tool_input?.command ?? '')
if (!/\\b(vercel|vc)\\b/.test(cmd)) process.exit(0)
const prot = (() => { try { return JSON.parse(readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), (process.env.FLOW_JOB_ID || '') + '.json'), 'utf8')) } catch { return null } })()
if (!prot) process.exit(0)
const names = new Set((prot.names || []).map((n) => String(n).toLowerCase())), ids = new Set(prot.ids || [])
const SAFE = /\\b(vercel|vc)\\s+(whoami|--version|-v|ls|list|inspect|logs|help|login|logout|teams|switch|project\\s+(ls|list|inspect)|projects\\s+(ls|list|inspect)|env\\s+(ls|list))\\b/
const block = (why) => { process.stderr.write('BLOQUÉ par Flow Studio : ' + why + ' Ce projet Vercel existe déjà et appartient à l\\'utilisateur : ne le modifie jamais. Crée un projet NEUF au nom unique (ex. mon-site-' + Math.random().toString(36).slice(2, 6) + ') avec vercel link --yes --project <nouveau-nom> dans un dossier dont le nom n\\'est pas déjà un projet.\\n'); process.exit(2) }
let cwd = inp.cwd || process.cwd()
for (const seg of cmd.split(/&&|;|\\|\\||\\n/)) {
  const cd = /^\\s*cd\\s+("([^"]+)"|'([^']+)'|(\\S+))/.exec(seg)
  if (cd) { const t = (cd[2] || cd[3] || cd[4] || '').replace(/^~/, process.env.HOME || ''); cwd = path.resolve(cwd, t); continue }
  if (!/\\b(vercel|vc)\\b/.test(seg) || SAFE.test(seg)) continue
  const flagCwd = /--cwd[ =]("([^"]+)"|\\S+)/.exec(seg); const dir = flagCwd ? path.resolve(cwd, (flagCwd[2] || flagCwd[1]).replace(/^~/, process.env.HOME || '')) : cwd
  const named = [...seg.matchAll(/--project[ =]([\\w.-]+)|\\bprojects?\\s+(?:add|rm|remove)\\s+([\\w.-]+)|--name[ =]([\\w.-]+)/g)].map((m) => (m[1] || m[2] || m[3] || '').toLowerCase())
  for (const n of named) if (names.has(n)) block('le projet « ' + n + ' » est protégé.')
  let linked = null
  for (const d of [dir, path.join(dir, '..')]) { try { linked = JSON.parse(readFileSync(path.join(d, '.vercel', 'project.json'), 'utf8')); break } catch { /* pas de lien */ } }
  if (linked) { if (ids.has(linked.projectId)) block('ce dossier est lié à un projet protégé.') }
  else if (!named.length && names.has(path.basename(dir).toLowerCase().replace(/[^a-z0-9._-]/g, '-'))) block('le nom du dossier « ' + path.basename(dir) + ' » correspond à un projet existant (Vercel le lierait).')
}
process.exit(0)
`
function writeGuard(jobId, projects) {
  mkdirSync(GUARD_DIR, { recursive: true, mode: 0o700 })
  writeFileSync(path.join(GUARD_DIR, 'vercel-guard.mjs'), GUARD_SCRIPT, { mode: 0o600 })
  const f = path.join(GUARD_DIR, `${jobId}.json`)
  if (!existsSync(f) && projects) writeFileSync(f, JSON.stringify({ names: projects.map((x) => x.name), ids: projects.map((x) => x.id).filter(Boolean), at: new Date().toISOString() }), { mode: 0o600 }) // figée : un projet créé ensuite par ce travail reste modifiable
}
function writeProjectSettings(dir) {
  const d = path.join(dir, '.claude'); mkdirSync(d, { recursive: true })
  const hooks = { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: `"${process.execPath}" "${path.join(GUARD_DIR, 'vercel-guard.mjs')}"` }] }] }
  writeFileSync(path.join(d, 'settings.json'), JSON.stringify({ permissions: { deny: DENY }, hooks }, null, 2))
}

function claudeArgs(c, sessionId) {
  const a = [...c.claudeArgsPrefix, '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'bypassPermissions', '--add-dir', c.atelier]
  if (sessionId) a.push('--resume', sessionId)
  a.push('--disallowedTools', 'Bash(sudo:*)')
  return a
}

/** Projets Vercel déjà présents dans le compte : la mission ne doit JAMAIS en toucher un (un site existant a déjà été écrasé par erreur). */
async function vercelProjects() {
  if (FAKE_ENV() || !which('vercel')) return []
  const out = await execFileAsync('vercel', ['project', 'ls', '--json'], 30000)
  try { return (JSON.parse(out.slice(out.indexOf('{'))).projects ?? []).map((p) => ({ name: String(p.name), id: String(p.id ?? '') })).filter((p) => /^[\w.-]{1,100}$/.test(p.name)) } catch { return [] }
}
async function startRun(job, { firstMessage, resume = false } = {}) {
  const c = cfg()
  const dir = jobDir(c, job)
  const st = (state.jobs[job.id] ??= { dir, sessionId: job.sessionId ?? null, nudges: 0, afterQueue: [] })
  st.dir = dir; st.title = job.title; st.kind = job.kind
  lj(job.id, { title: job.title, kind: job.kind, dir, status: 'running', sessionId: st.sessionId ?? '' })
  mkdirSync(path.join(dir, 'entrees'), { recursive: true })
  for (const sub of job.kind === 'motion' ? ['analyse', 'scripts', 'sons', 'rendu'] : ['rendu']) mkdirSync(path.join(dir, sub), { recursive: true })
  writeProjectSettings(dir)
  let extra = ''
  if (job.kind === 'site') {
    const prior = existsSync(path.join(GUARD_DIR, `${job.id}.json`))
    const projects = prior ? null : await vercelProjects()
    writeGuard(job.id, projects)
    const frozen = readJson(path.join(GUARD_DIR, `${job.id}.json`), { names: [] })
    const existing = frozen.names
    if (existing.length) {
      extra = `\n9. **Projets Vercel EXISTANTS : INTERDITS** (ne jamais les modifier, redéployer, lier, ni réutiliser leur nom ; ton projet est NEUF) : ${existing.join(', ')}.\n`
      try { writeFileSync(path.join(dir, 'PROJETS_VERCEL_EXISTANTS.md'), `# Projets Vercel existants (à ne jamais toucher)\n\n${existing.map((n) => `- ${n}`).join('\n')}\n`) } catch {}
    }
  }
  if (!resume) {
    for (const f of job.inputs) { try { await download(f.url, path.join(dir, 'entrees', safe(f.name))) } catch (e) { log('input', f.name, e.message) } }
    writeFileSync(path.join(dir, 'PROMPT.md'), job.prompt + protocol(job.kind, dir, job.spec, extra))
  }
  const prompt = firstMessage ?? (job.prompt + protocol(job.kind, dir, job.spec, extra) + (job.inputs.length ? `\n\nLes fichiers fournis sont déjà copiés dans \`${path.join(dir, 'entrees')}\`.` : ''))
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
    const lo = lj(id)
    for (const part of m.message?.content ?? []) { // conversation complète, affichée dans la fenêtre (sans limite de débit)
      if (part.type === 'text' && part.text?.trim()) lpush(lo, { k: 'claude', text: String(part.text).trim().slice(0, 6000) })
      else if (part.type === 'tool_use') { const i = part.input ?? {}; lpush(lo, { k: 'tool', text: i.command ? short(i.command, 220) : i.file_path ? `${part.name} ${short(i.file_path, 160)}` : i.url ? `${part.name} ${short(i.url, 160)}` : i.pattern ? `${part.name} ${short(i.pattern, 120)}` : part.name }) }
    }
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
      if (p?.step) { const pct = typeof p.progress === 'number' ? Math.max(Math.min(99, Math.round(p.progress)), run.lastPct ?? 0) : undefined; if (pct != null) run.lastPct = pct; void emit(id, { type: 'step', step: String(p.step), progress: pct, detail: p.detail ? short(p.detail, 300) : undefined }) } // l'avancement ne recule jamais
    }
  } catch { /* pas encore écrit */ }
  const tf = path.join(run.dir, 'todo.json')
  try {
    const mt = statSync(tf).mtimeMs
    if (mt !== run.todoMtime) {
      run.todoMtime = mt
      const t = jsonFile(tf); const items = Array.isArray(t) ? t : t?.items
      if (Array.isArray(items)) { const total = items.length, done = items.filter((i) => i?.state === 'done' || i?.done === true).length; const pct = total ? Math.min(96, Math.round(3 + (93 * done) / total)) : 0; if (pct > (run.lastPct ?? 0)) { run.lastPct = pct; void emit(id, { type: 'step', step: lj(id).step ?? STEPS[run.job.kind][0], progress: pct }) } } // l'avancement suit les tâches cochées : régulier, sans à-coups
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
    const summary = rm2 ? readFileSync(rm2, 'utf8').trim().slice(0, 9000) : undefined // le compte rendu complet (fonctionnalités, à savoir, accès)
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

/** Navigateur par défaut (celui où l'utilisateur est connecté à Flow) : chrome, safari ou autre. */
let browserCache = null
function defaultBrowser() {
  if (browserCache) return browserCache
  let id = osa(['-l', 'JavaScript', '-e', `ObjC.import('AppKit');const u=$.NSWorkspace.sharedWorkspace.URLForApplicationToOpenURL($.NSURL.URLWithString('https://example.com'));u.isNil()?'':ObjC.unwrap(u.path)`]) ?? ''
  browserCache = /Safari/i.test(id) ? 'safari' : /Chrome/i.test(id) && existsSync(CHROME) ? 'chrome' : id ? 'other' : existsSync(CHROME) ? 'chrome' : 'safari'
  return browserCache
}
/** Ouvre une adresse dans une NOUVELLE fenêtre du navigateur par défaut (session Flow conservée). `app` : fenêtre sans barre d'adresse quand c'est possible. */
function openWindow(url, { app = false } = {}) {
  try {
    const b = defaultBrowser()
    if (b === 'chrome') { if (app) execFileSync('/usr/bin/open', ['-na', 'Google Chrome', '--args', `--app=${url}`], { stdio: 'ignore' }); else osa(['-e', `tell application "Google Chrome"\nactivate\nmake new window\nset URL of active tab of front window to "${url}"\nend tell`]) }
    else if (b === 'safari') osa(['-e', `tell application "Safari"\nactivate\nmake new document with properties {URL:"${url}"}\nend tell`])
    else execFileSync('/usr/bin/open', [url], { stdio: 'ignore' })
    return true
  } catch (e) { log('open-window', e.message); return false }
}
function openStudio() {
  if (NO_WINDOWS || platform() !== 'darwin') return false
  try {
    const app = path.join(HOME, 'Applications', 'Flow Studio.app')
    if (existsSync(app)) { execFileSync('/usr/bin/open', [app], { stdio: 'ignore' }); return true }
    const u = readUiJson(); if (u) return openWindow(u.url, { app: true })
  } catch (e) { log('open-studio', e.message) }
  return false
}

/** Range les fenêtres : Flow Studio (fenêtre native) à gauche, le logiciel de montage à droite s'il est ouvert ; sinon Flow Studio prend tout l'écran utile. La fenêtre native lit layout.json. */
const LAYOUT_JSON = path.join(DIR, 'layout.json')
function tileWindows() {
  if (NO_WINDOWS || platform() !== 'darwin') return
  const F = screenFrame()
  const editor = listWindows().find((w) => EDITOR_RE.test(w.app))
  const lw = editor ? Math.round(F.w * 0.42) : F.w
  try { writeFileSync(LAYOUT_JSON, JSON.stringify({ x: F.x, y: F.y, w: lw, h: F.h, t: Date.now() })) } catch {}
  if (editor) { // demande l'accès « Accessibilité » une fois ; sans lui, la fenêtre du logiciel reste où elle est
    const x1 = F.x + lw, y1 = F.y, w = F.w - lw, h = F.h
    osa(['-e', `tell application "System Events" to tell (first process whose name is "${editor.app}") to try
set position of window 1 to {${x1}, ${y1}}
set size of window 1 to {${w}, ${h}}
end try`])
  }
}

/** Page locale du site : on l'ouvre dans sa propre fenêtre (adresse locale uniquement) puis on range les fenêtres. */
function setPreviewUrl(run, url) {
  if (!LOCAL_URL.test(url) || run.siteUrl === url) return
  run.siteUrl = url; lj(run.job.id).siteUrl = url // la page est affichée, cliquable, dans la fenêtre Flow Studio
  void emit(run.job.id, { type: 'log', title: 'Aperçu du site', body: url })
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
  let tiled = '', lastFlow = 0
  while (!run.exited && !run.cancelled && !run.delivered) {
    let wait = 15000
    try {
      const local = Date.now() - LOCAL.uiSeen < 8000 // la fenêtre Flow Studio est ouverte : image du montage toutes les 2 s
      const wins = listWindows()
      const editor = wins.filter((w) => EDITOR_RE.test(w.app)).sort((a, b) => b.w * b.h - a.w * a.h)[0]
      const sig = `${editor?.id ?? ''}`
      if (sig !== tiled) { tiled = sig; tileWindows() }
      const f = path.join(tmp, 'editor.jpg')
      if (editor && captureWindow(editor.id, f)) {
        LOCAL.editor = { buf: readFileSync(f), at: Date.now() }
        if ((watching || Date.now() - lastFlow > 15000)) { lastFlow = Date.now(); await sendPreview(run.job.id, 'editor', f, editor.app) }
      }
      if (run.siteUrl && (watching || Date.now() - lastFlow > 15000)) { const g = path.join(tmp, 'site.jpg'); if (captureUrl(run.siteUrl, g)) await sendPreview(run.job.id, 'site', g, run.siteUrl) }
      wait = local ? 2000 : watching ? 3000 : 15000
    } catch (e) { log('preview', e.message) }
    await sleepMs(wait)
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
      if (payload?.action === 'open_studio') { const r = [...runs.values()].find((x) => !x.exited); if (typeof payload.component === 'string' && UUID_RE.test(payload.component)) LOCAL.focus = { jobId: payload.component, t: Date.now() }; openStudio(); if (r) setTimeout(() => tileWindows(r), 3000); return }
      await doSetupCommand(payload ?? {})
    } else if (type === 'message') {
      await runMessage(jobId, payload.text, { eventId: payload.eventId, mode: payload.mode, files: payload.files })
    } else if (type === 'answer') {
      if (!run || run.exited) return
      run.waitingAnswer = false; localApply(jobId, { type: 'answered', text: payload.text })
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
  if (!c.deviceToken) { if (process.stdout.isTTY) { console.error('Ce Mac n\'est pas relié. Ouvre l\'application Flow Studio ou lance :  node flow-bridge.mjs connect'); process.exit(1) } }
  log('bridge démarré', VERSION, c.server)
  appState.paired = !!c.deviceToken
  loadLocal()
  for (const [id, st] of Object.entries(state.jobs)) if (!LOCAL.jobs[id]) lj(id, { title: st.title ?? 'Projet', kind: st.kind ?? 'site', dir: st.dir ?? '', status: st.status === 'running' ? 'failed' : (st.status ?? 'done'), sessionId: st.sessionId ?? '' })
  try { await startUiServer('service') } catch (e) { log('ui', e.message) }
  setTimeout(() => void syncRemote(), 1500); setInterval(() => void syncRemote(), 15_000)
  void refreshScan()
  setInterval(() => { if (!setupState.installing) void refreshScan() }, 10 * 60_000)
  setTimeout(() => void refreshAccounts(), 3000); setInterval(() => void refreshAccounts(), 10 * 60_000)
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
    if (!cfg().deviceToken) { appState.paired = false; if (!appState.pair && !unpairing) { unpairing = true; void appPairing().finally(() => { unpairing = false }) } await sleep(2000); continue }
    try {
      const b = busy()
      const out = await api('POST', 'bridge/poll', { busyJob: b?.job.id ?? null, version: VERSION, claudeOk: claudeOk() })
      watching = out.watch === true
      for (const cmd of [...pending.splice(0), ...out.commands]) await handle(cmd)
    } catch (e) {
      if (e.status === 401) { log('401 : jeton refusé'); unpair(); await sleep(3000) }
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
const SKILLS = ['effectcraft', 'motion-reference-clone', 'analyse-image', 'decoupage-reference', 'site-creation']
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
  const vlog = vc ? (ACCOUNTS.vercel ?? null) : null
  add({ id: 'vercel', name: 'Vercel (mise en ligne des sites)', group: 'site', state: vc ? (vlog ? 'ok' : 'warn') : 'missing', version: vlog ?? undefined, detail: vc ? (vlog ? undefined : 'Installé mais pas connecté : lance « vercel login » dans le Terminal.') : 'Pour publier les sites.', installable: true })
  { // comptes : lus dans un cache rafraîchi sans bloquer (refreshAccounts)
  const gh = which('gh'); const ghOk = gh ? ACCOUNTS.github === true : false
  add({ id: 'github', name: 'GitHub', group: 'site', state: ghOk ? 'ok' : 'warn', detail: ghOk ? undefined : (gh ? 'Pas connecté : bouton « Connecter » dans Paramètres > Studio.' : 'Facultatif : pour ranger le code dans ton compte.'), installable: false })
  const sb = which('supabase'); const sbOk = sb ? ACCOUNTS.supabase === true : false
  add({ id: 'supabase', name: 'Supabase', group: 'site', state: sbOk ? 'ok' : 'warn', detail: sbOk ? undefined : (sb ? 'Pas connecté : bouton « Connecter » dans Paramètres > Studio.' : 'Facultatif : pour les sites avec base de données.'), installable: false })
  }
  add({ id: 'git', name: 'Git', group: 'site', state: which('git') ? 'ok' : 'missing', installable: false, detail: which('git') ? undefined : 'Installe les outils de développement Apple : xcode-select --install' })
  if (FAKE && process.env.FLOW_FAKE_MISSING) for (const id of process.env.FLOW_FAKE_MISSING.split(',')) { const x = out.find((c) => c.id === id); if (x && !fakeDone.has(id)) { x.state = 'missing'; x.version = undefined } }
  return out
}

const ACCOUNTS = {}
const execFileAsync = (cmd, args, timeout = 20000) => new Promise((resolve) => { try { execFile(cmd, args, { timeout, env: TOOL_ENV() }, (err, out) => resolve(err ? null : String(out).trim())) } catch { resolve(null) } })
let accountsBusy = false
/** Vérifie Vercel / GitHub / Supabase sans bloquer le pont ni la fenêtre. */
async function refreshAccounts() {
  if (accountsBusy || FAKE) return
  accountsBusy = true
  try {
    if (which('vercel')) ACCOUNTS.vercel = await execFileAsync('vercel', ['whoami']) ?? undefined
    if (which('gh')) ACCOUNTS.github = (await execFileAsync('gh', ['auth', 'status'])) !== null
    if (which('supabase')) ACCOUNTS.supabase = (await execFileAsync('supabase', ['projects', 'list'])) !== null
  } finally { accountsBusy = false }
  await refreshScan()
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
  if (claudeOk(true)) { await sleep(1500); closeLoginTabs('claude') }
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
const LOGIN_TABS = { vercel: ['vercel.com/oauth/device', 'vercel.com/login', 'vercel.com/api/registration'], github: ['github.com/login/device', 'github.com/login/oauth'], supabase: ['supabase.com/dashboard/cli/login', 'supabase.com/dashboard/cli'], claude: ['claude.ai/oauth', 'claude.com/cai/oauth', 'claude.ai/login', 'console.anthropic.com/oauth'] }
const LOGIN_CHECK = { vercel: ['vercel', ['whoami']], github: ['gh', ['auth', 'status']], supabase: ['supabase', ['projects', 'list']] }
/** Ferme les pages de connexion restées ouvertes (onglets Safari / Chrome) une fois la connexion terminée. */
function closeLoginTabs(id) {
  const pats = LOGIN_TABS[id]; if (!pats || platform() !== 'darwin' || FAKE) return
  const cond = pats.map((x) => `(u contains "${x}")`).join(' or ')
  for (const app of ['Safari', 'Google Chrome']) {
    if (!osa(['-e', `application "${app}" is running`])?.includes('true')) continue
    const tabUrl = app === 'Safari' ? 'URL of t' : 'URL of t'
    osa(['-e', `tell application "${app}"
repeat with w in (reverse of (get windows))
repeat with t in (reverse of (get tabs of w))
try
set u to ${tabUrl}
if ${cond} then close t
end try
end repeat
end repeat
end tell`])
  }
}
const loginWins = {}
function closeLoginTerminal(id) {
  const wid = loginWins[id]; if (!wid) return
  osa(['-e', `tell application "Terminal"\ntry\nclose (every window whose id is ${Number(wid)}) saving no\nend try\nend tell`])
  delete loginWins[id]
}
/** Surveille la connexion : dès qu'elle réussit, ferme la fenêtre Terminal et les pages de connexion, puis met à jour l'état. */
async function watchLogin(id) {
  const chk = LOGIN_CHECK[id]; if (!chk) return
  for (let i = 0; i < 120; i++) { // 10 minutes
    await sleep(5000)
    if ((await execFileAsync(chk[0], chk[1], 15000)) !== null) {
      await sleep(1500); closeLoginTerminal(id); closeLoginTabs(id)
      await refreshAccounts(); return
    }
  }
}
function loginInTerminal(id) {
  const cmd = Object.hasOwn(LOGIN_CMD, id) ? LOGIN_CMD[id] : null
  if (!cmd || platform() !== 'darwin' || FAKE) return false
  const line = `export PATH="${OWN_BIN.join(':')}:/opt/homebrew/bin:/usr/local/bin:$PATH"; clear; echo "Flow Studio — connexion ${id}"; ${cmd}; echo; echo "Terminé : cette fenêtre se ferme toute seule."`
  const wid = osa(['-e', `tell application "Terminal"\nactivate\ndo script ${JSON.stringify(line)}\nreturn id of front window\nend tell`])
  if (wid && /^\d+$/.test(wid)) loginWins[id] = wid
  void watchLogin(id)
  return true
}
async function doSetupCommand(p) {
  if (p.action === 'rescan') { await refreshScan(); return }
  if (p.action === 'open_claude') { if (typeof p.component === 'string' && UUID_RE.test(p.component)) await localAction('open-claude', { jobId: p.component }); return }
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
      let paired = false
      for (let attempt = 0; attempt < 4 && !paired; attempt++) { // le code est renouvelé tout seul s'il expire : l'installation n'échoue plus pour ça
        const res = await api('POST', 'pair/start', info, { auth: false })
        gui({ phase: 'pair', step: 'Dernière étape : connecte-toi à Flow dans la page qui s’ouvre. Le Mac est relié automatiquement.', pct: 85, code: res.code, url: `${c.server}/studio/connect#code=${res.code}` })
        const t0 = Date.now()
        while (Date.now() - t0 < res.expiresInSec * 1000) {
          await sleep(2500)
          const r = await api('GET', `pair/poll?token=${encodeURIComponent(res.pollToken)}`, undefined, { auth: false }).catch(() => null)
          if (r?.status === 'paired') { saveCfg({ ...readJson(CONFIG, {}), server: c.server, deviceToken: r.deviceToken }); paired = true; break }
          if (r?.status === 'expired') break
        }
      }
      if (!paired) throw new Error('La liaison n’a pas été confirmée à temps. Relance l’installateur.')
    }
    // 5. démarrage automatique
    gui({ phase: 'service', step: 'Activation du démarrage automatique…', pct: 94, code: '', url: '' })
    install()
    await refreshScan()
    gui({ phase: 'done', step: issues.length ? `Terminé, avec des points à revoir : ${issues.join(' ; ')}` : 'Terminé : ton Mac est prêt.', pct: 100, code: '', url: '' })
    setTimeout(() => openStudio(), 1500) // une fois le Mac relié, Flow Studio s'ouvre
    await sleep(4000)
  } catch (e) {
    gui({ phase: 'error', error: String(e.message ?? e).slice(0, 300) })
    log('gui-setup', e.message)
  }
}

/* ───────── Application Flow Studio (fenêtre locale) : liaison, vérification, installation, puis ouverture de Flow Studio ───────── */
const appState = { pair: null, paired: false, running: false, step: '', error: '', handoff: null }
const MOTION_IDS = ['effectcraft', 'aftereffects', 'remotion']
const motionOk = () => setupState.components.some((c) => MOTION_IDS.includes(c.id) && c.state === 'ok')
const readyIssues = () => {
  const by = (id) => setupState.components.find((c) => c.id === id)
  const out = []
  if (!appState.paired) out.push('Relie ce Mac à Flow.')
  for (const id of ['node', 'claude', 'skills', 'ffmpeg']) { const c = by(id); if (c && c.state !== 'ok') out.push(`${c.name} : ${c.state === 'warn' ? 'à connecter' : 'à installer'}.`) }
  if (!motionOk()) out.push('Choisis un moteur de motion design (EffectCraft, gratuit).')
  return out
}
/** Ce Mac n'est plus relié (appareil supprimé dans Flow, jeton refusé) : on repart d'un code de liaison valide, la fenêtre revient à l'assistant. */
let unpairing = false
function unpair() {
  if (unpairing) return
  unpairing = true
  const c = readJson(CONFIG, {}); delete c.deviceToken; delete c.started; saveCfg(c)
  appState.paired = false; appState.pair = null
  log('mac non relié : nouveau code')
  void appPairing().finally(() => { unpairing = false })
}
async function appPairing() {
  const c = cfg()
  if (c.deviceToken) { appState.paired = true; return }
  const info = { deviceName: process.env.FLOW_DEVICE_NAME || hostname().replace(/\.local$/, ''), os: 'macOS', version: VERSION }
  for (let attempt = 0; attempt < 12 && !appState.paired; attempt++) { // le code se renouvelle tout seul : la fenêtre peut rester ouverte
    let res
    try { res = await api('POST', 'pair/start', info, { auth: false }) } catch { appState.error = 'Flow est injoignable (Internet ?) : nouvel essai…'; await sleep(5000); continue }
    appState.error = ''
    appState.pair = { code: res.code, url: `${c.server}/studio/connect#code=${res.code}`, expiresAt: Date.now() + res.expiresInSec * 1000 }
    const t0 = Date.now()
    while (Date.now() - t0 < res.expiresInSec * 1000) {
      await sleep(2000)
      const r = await api('GET', `pair/poll?token=${encodeURIComponent(res.pollToken)}`, undefined, { auth: false }).catch(() => null)
      if (r?.status === 'paired') { saveCfg({ ...readJson(CONFIG, {}), server: c.server, deviceToken: r.deviceToken }); appState.paired = true; appState.pair = null; break }
      if (r?.status === 'expired') break
    }
  }
  if (appState.paired) { try { install() } catch (e) { log('app-install', e.message) } await refreshScan() }
}
/** Installe tout ce qui manque (jamais ce qui existe déjà), puis revérifie. */
async function appInstall(engine) {
  if (appState.running) return
  appState.running = true; appState.error = ''
  try {
    appState.step = 'Vérification de ton Mac…'
    await refreshScan({ post: false })
    const by = (id) => setupState.components.find((c) => c.id === id)
    if (!motionOk() && MOTION_IDS.includes(engine)) { appState.step = 'Installation du moteur de motion design…'; await installComponent(engine, { choice: engine }) }
    for (const id of ['claude', 'skills', 'ffmpeg', 'python']) {
      const c = by(id)
      if (c && c.state !== 'ok' && c.installable !== false && !(id === 'claude' && c.state === 'warn')) { appState.step = `Installation de ${c.name}…`; await installComponent(id) }
    }
    await refreshScan({ post: false })
    if (by('claude')?.state === 'warn') { appState.step = 'Connexion à Claude : termine dans la page du navigateur qui s’ouvre…'; await loginClaude() }
    appState.step = 'Vérification finale…'
    await refreshScan({ post: appState.paired })
    const left = readyIssues().filter((x) => !x.startsWith('Relie'))
    appState.step = left.length ? '' : 'Tout est prêt.'
    if (left.length) appState.error = left.join(' ')
  } catch (e) { appState.error = String(e.message ?? e).slice(0, 300); log('app-install', e.message) }
  appState.running = false
}
const APP_ITEMS = ['node', 'claude', 'effectcraft', 'aftereffects', 'remotion', 'ffmpeg', 'python', 'skills']
function appSnapshot() {
  const items = setupState.components.filter((c) => APP_ITEMS.includes(c.id)).map((c) => ({ id: c.id, name: c.name, state: c.state, cost: c.cost ?? null, detail: c.detail ?? '', version: c.version ?? '', group: c.group }))
  const inst = setupState.installing
  const issues = readyIssues()
  return { server: cfg().server, paired: appState.paired, pair: appState.pair, items, motionOk: motionOk(), running: appState.running, step: inst ? `${inst.label} — ${inst.step}` : appState.step, pct: inst?.pct ?? null, error: appState.error, issues, ready: issues.length === 0 }
}
function openAppWindow(url) {
  try {
    if (defaultBrowser() === 'chrome') execFileSync('/usr/bin/open', ['-na', 'Google Chrome', '--args', `--app=${url}`, '--window-size=1000,740'], { stdio: 'ignore' })
    else openWindow(url)
  } catch (e) { log('app-window', e.message) }
}
/* ───────── Mémoire locale : tout ce que montre la fenêtre Flow Studio (instantané, sans passer par Internet) ───────── */
const LOCAL = { jobs: {}, order: [], uiSeen: 0, editor: null, focus: null }
const LOCAL_JSON = path.join(DIR, 'local.json')
let saveTimer = null
function scheduleSaveLocal() {
  if (saveTimer) return
  saveTimer = setTimeout(() => { // l'état affiché survit aux redémarrages (conversation, tâches, avancement)
    saveTimer = null
    try { const out = {}; for (const id of LOCAL.order) { const j = LOCAL.jobs[id]; if (j) out[id] = { ...j, transcript: j.transcript.slice(-250) } }; writeFileSync(LOCAL_JSON, JSON.stringify({ order: LOCAL.order, jobs: out }), { mode: 0o600 }) } catch {}
  }, 1500)
}
function loadLocal() {
  const d = readJson(LOCAL_JSON, null); if (!d?.jobs) return
  for (const id of d.order ?? []) { const j = d.jobs[id]; if (j && UUID_RE.test(id) && !LOCAL.jobs[id]) { LOCAL.jobs[id] = { ...j, seq: Math.max(j.seq ?? 0, ...(j.transcript ?? []).map((t) => t.n)) }; LOCAL.order.push(id) } }
}
/** Tous les projets du compte Flow (créés depuis le site, ailleurs, terminés…) : la page d'accueil du logiciel les montre avec leur état. */
async function syncRemote() {
  try {
    const { jobs } = await api('GET', 'bridge/jobs')
    for (const r of jobs ?? []) {
      if (!UUID_RE.test(r.id)) continue
      const run = runs.get(r.id)
      const j = lj(r.id)
      j.kind = r.kind; j.title = r.title; j.createdAt = new Date(r.createdAt).getTime() || j.createdAt
      if (!run || run.exited) { j.status = r.status === 'starting' ? 'running' : r.status; j.progress = r.status === 'done' ? 100 : Math.max(j.progress ?? 0, r.progress ?? 0); if (r.step) j.step = r.step }
      if (r.url) j.deliverUrl = r.url
      if (r.summary) j.summary = r.summary
    }
    LOCAL.order.sort((a, b) => (LOCAL.jobs[b]?.createdAt ?? 0) - (LOCAL.jobs[a]?.createdAt ?? 0))
    scheduleSaveLocal()
  } catch (e) { if (e.status === 401) return; log('sync', e.message) }
}
const STEP_LABELS = {
  motion: { receive: 'Réception', analyse: 'Analyse de la référence', plan: 'Plan', build: 'Construction', compare: 'Comparaison image par image', sound: 'Son', render4k: 'Rendu 4K', verify: 'Vérification' },
  site: { interview: 'Compréhension du projet', analyse: 'Analyse des exemples', design: 'Design system', structure: 'Structure et contenus', build: 'Construction', data: 'Données et comptes', polish: 'Grande amélioration', deploy: 'Déploiement', qa: 'Vérification complète', motion: 'Vidéo motion design', deliver: 'Livraison' },
}
function lj(id, init) {
  let j = LOCAL.jobs[id]
  if (!j) { j = LOCAL.jobs[id] = { id, title: 'Projet', kind: 'site', status: 'draft', step: null, progress: 0, transcript: [], todo: [], questions: [], summary: '', deliverUrl: '', siteUrl: '', dir: '', sessionId: '', seq: 0, createdAt: Date.now() }; LOCAL.order.unshift(id) }
  if (init) Object.assign(j, init)
  return j
}
function lpush(j, e) { scheduleSaveLocal(); j.transcript.push({ n: ++j.seq, at: Date.now(), ...e }); if (j.transcript.length > 800) j.transcript.splice(0, j.transcript.length - 800) }
const OWN_LOG = new Set(['Claude', 'Commande', 'Bash', 'Write', 'Edit', 'Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch', 'Task', 'TodoWrite'])
/** Reflète localement chaque événement envoyé à Flow. */
function localApply(jobId, ev) {
  scheduleSaveLocal()
  const j = lj(jobId)
  if (ev.type === 'status') { j.status = ev.status === 'starting' ? 'running' : ev.status; if (ev.progress != null) j.progress = Math.max(j.progress, ev.progress); if (ev.title) lpush(j, { k: 'sys', text: ev.title + (ev.body ? ` — ${ev.body}` : ''), level: ev.status === 'failed' ? 'error' : 'info' }); if (ev.error) lpush(j, { k: 'sys', text: ev.error, level: 'error' }) }
  else if (ev.type === 'step') { j.step = ev.step; if (ev.progress != null) j.progress = Math.max(j.progress, Math.min(99, ev.progress)) }
  else if (ev.type === 'log' && !OWN_LOG.has(ev.title)) lpush(j, { k: 'sys', text: `${ev.title}${ev.body ? ` — ${ev.body}` : ''}`, level: ev.level ?? 'info' })
  else if (ev.type === 'question') { const q = { id: `q${++j.seq}`, text: ev.text, choices: ev.choices ?? null, answered: false }; j.questions.push(q); j.status = 'needs_answer'; lpush(j, { k: 'question', text: ev.text, qid: q.id }) }
  else if (ev.type === 'answered') { for (const q of j.questions) if (!q.answered) { q.answered = true; q.answer = ev.text } if (j.status === 'needs_answer') j.status = 'running' }
  else if (ev.type === 'todo') j.todo = ev.items
  else if (ev.type === 'session') j.sessionId = ev.sessionId
  else if (ev.type === 'delivered') { j.status = 'done'; j.progress = 100; j.summary = ev.summary ?? ''; j.deliverUrl = ev.deliver?.url ?? ''; lpush(j, { k: 'sys', text: j.kind === 'site' ? 'Site terminé.' : 'Rendu terminé.', level: 'success' }) }
}
function localList() {
  const labels = (j) => STEP_LABELS[j.kind]?.[j.step] ?? ''
  return LOCAL.order.map((id) => LOCAL.jobs[id]).filter(Boolean).map((j) => ({ id: j.id, title: j.title, kind: j.kind, status: j.status, step: j.step, stepLabel: labels(j), progress: j.status === 'done' ? 100 : j.progress, createdAt: j.createdAt, deliverUrl: j.deliverUrl || '', hasDir: !!j.dir, todoDone: j.todo.filter((t) => t.state === 'done').length, todoTotal: j.todo.length }))
}
function localJob(id, after = 0) {
  const j = LOCAL.jobs[id]; if (!j) return null
  const labels = STEP_LABELS[j.kind] ?? {}
  const ids = (STEPS[j.kind] ?? [])
  const at = j.step ? ids.indexOf(j.step) : -1
  const steps = ids.map((sid, i) => ({ id: sid, label: labels[sid] ?? sid, state: j.status === 'done' ? 'done' : at === -1 ? 'todo' : i < at ? 'done' : i === at ? (j.status === 'paused' ? 'blocked' : 'active') : 'todo' }))
  return { id: j.id, title: j.title, kind: j.kind, status: j.status, step: j.step, progress: j.progress, steps, todo: j.todo, questions: j.questions.filter((q) => !q.answered), summary: j.summary, deliverUrl: j.deliverUrl, siteUrl: j.siteUrl, dir: j.dir, hasSession: !!j.sessionId, startedAt: j.createdAt, seq: j.seq, transcript: j.transcript.filter((t) => t.n > after), editorAt: LOCAL.editor?.at ?? 0 }
}
/** Actions demandées depuis la fenêtre (messages, pause, réponse…) : même chemin que les commandes venant de Flow. */
async function localAction(route, b) {
  const id = typeof b.jobId === 'string' && UUID_RE.test(b.jobId) ? b.jobId : null
  const j = id ? LOCAL.jobs[id] : null
  if (!j) return { error: 'job' }
  if (route === 'message') {
    const text = String(b.text ?? '').slice(0, 8000).trim(); if (!text) return { error: 'empty' }
    const mode = ['now', 'next', 'after'].includes(b.mode) ? b.mode : 'next'
    lpush(j, { k: 'user', text })
    void emit(id, { type: 'log', title: 'Message depuis le Mac', body: short(text, 300) })
    void runMessage(id, text, { mode }).catch((e) => lpush(j, { k: 'sys', text: `Message non transmis : ${e.message}`, level: 'error' }))
    return { ok: true }
  }
  if (route === 'control') { const t = ['pause', 'resume', 'cancel'].includes(b.action) ? b.action : null; if (!t) return { error: 'action' }; await handle({ jobId: id, type: t, payload: {} }); return { ok: true } }
  if (route === 'answer') {
    const q = j.questions.find((x) => x.id === b.qid && !x.answered); const text = String(b.text ?? '').slice(0, 4000).trim(); if (!q || !text) return { error: 'question' }
    q.answered = true; q.answer = text; lpush(j, { k: 'user', text })
    await handle({ jobId: id, type: 'answer', payload: { questionId: q.id, text, question: q.text } })
    void emit(id, { type: 'answered', text }); return { ok: true }
  }
  if (route === 'open-folder') { if (j.dir && existsSync(j.dir) && platform() === 'darwin') execFileSync('/usr/bin/open', [j.dir], { stdio: 'ignore' }); return { ok: true } }
  if (route === 'open-claude') {
    if (!j.dir || !existsSync(j.dir) || platform() !== 'darwin') return { error: 'dossier' }
    const st = state.jobs[id]
    const bin = resolveClaude('claude')
    const ctx = `Reprends ce projet (${j.kind === 'site' ? 'site web' : 'motion design'} « ${j.title} »). Lis d'abord CLAUDE.md, BRIEF.md, DESIGN.md, HYPOTHESES.md, LIVRAISON.md, todo.json, qa/RAPPORT.md et PROMPT.md s'ils existent pour retrouver tout le contexte, puis dis-moi en 5 lignes où on en est et attends mes instructions pour l'améliorer ou le continuer.`
    // contexte lu automatiquement par la nouvelle session (CLAUDE.md) + consigne copiée dans le presse-papiers
    try {
      writeFileSync(path.join(j.dir, 'REPRISE.md'), `# Reprise du projet « ${j.title} »\n\n${ctx}\n${st?.sessionId ? `\nConversation d'origine : \`claude --resume ${st.sessionId}\` (dans ce dossier).\n` : ''}`)
      const cm = path.join(j.dir, 'CLAUDE.md'); const cur = existsSync(cm) ? readFileSync(cm, 'utf8') : ''
      if (!cur.includes('REPRISE.md')) writeFileSync(cm, `${cur}\n\n## Reprise\nAu début de chaque nouvelle session : lis REPRISE.md, BRIEF.md, DESIGN.md, HYPOTHESES.md, LIVRAISON.md et qa/RAPPORT.md, puis résume où on en est avant d'agir. Ne modifie jamais un projet Vercel existant qui n'a pas été créé par ce projet.\n`)
    } catch {}
    try { execFileSync('/usr/bin/pbcopy', [], { input: ctx }) } catch {}
    const link = `claude://code/new?folder=${encodeURIComponent(j.dir)}&source=flow-studio`
    try { execFileSync('/usr/bin/open', [link], { stdio: 'ignore' }); return { ok: true, app: true } } catch { /* application Claude absente : Terminal */ }
    const cmd = st?.sessionId ? `cd ${JSON.stringify(j.dir)} && ${JSON.stringify(bin)} --resume ${st.sessionId}` : `cd ${JSON.stringify(j.dir)} && ${JSON.stringify(bin)} ${JSON.stringify(ctx)}`
    osa(['-e', `tell application "Terminal"\nactivate\ndo script ${JSON.stringify(cmd)}\nend tell`])
    return { ok: true }
  }
  if (route === 'attach') {
    const name = safe(String(b.name ?? 'fichier')); const buf = Buffer.from(String(b.data ?? ''), 'base64')
    if (!buf.length || buf.length > 25 * 1024 * 1024 || !j.dir) return { error: 'file' }
    const d = path.join(j.dir, 'entrees'); mkdirSync(d, { recursive: true })
    const dest = path.join(d, `msg-${Date.now()}-${name}`); writeFileSync(dest, buf)
    return { ok: true, path: `entrees/${path.basename(dest)}` }
  }
  return { error: 'route' }
}

/* ───────── Serveur de la fenêtre (127.0.0.1 uniquement, jeton secret, hôte vérifié) ───────── */
const UI_JSON = path.join(DIR, 'ui.json')
function writeUiJson(kind, url) { try { writeFileSync(UI_JSON, JSON.stringify({ pid: process.pid, url, kind }), { mode: 0o600 }) } catch {} }
function readUiJson() { const u = readJson(UI_JSON, null); if (!u?.pid) return null; try { process.kill(u.pid, 0); return u } catch { return null } }
async function startUiServer(kind) {
  const token = randomBytes(18).toString('hex')
  const csp = "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data: blob:; frame-src http://localhost:* http://127.0.0.1:* http://[::1]:*; connect-src 'self'; frame-ancestors 'none'"
  const server = createServer(async (req, res) => {
    const send = (code, body, type = 'application/json', extra = {}) => { res.writeHead(code, { 'content-type': type.startsWith('image') ? type : `${type}; charset=utf-8`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': csp, ...extra }); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)) }
    try {
      const port = server.address().port
      if (req.headers.host !== `127.0.0.1:${port}`) return send(403, { error: 'host' }) // protège contre les sites web qui tentent d'atteindre cette fenêtre
      const u = new URL(req.url, `http://127.0.0.1:${port}`)
      const prefix = `/t/${token}/`
      if (!u.pathname.startsWith(prefix)) return send(404, { error: 'not found' })
      const route = u.pathname.slice(prefix.length)
      LOCAL.uiSeen = Date.now()
      if (req.method === 'GET') {
        if (route === '') return send(200, UI_HTML, 'text/html')
        if (route === 'state') return send(200, { ...appSnapshot(), jobs: localList(), started: cfg().started === true, handoff: appState.handoff ?? null, focus: LOCAL.focus })
        if (route.startsWith('job/')) { const id = route.slice(4); const j = UUID_RE.test(id) ? localJob(id, Number(u.searchParams.get('after') ?? 0) || 0) : null; return j ? send(200, j) : send(404, { error: 'job' }) }
        if (route === 'editor.jpg') return LOCAL.editor ? send(200, LOCAL.editor.buf, 'image/jpeg') : send(404, { error: 'none' })
        return send(404, { error: 'not found' })
      }
      if (req.method !== 'POST' || req.headers['x-flow'] !== '1' || (req.headers.origin && req.headers.origin !== `http://127.0.0.1:${port}`)) return send(403, { error: 'forbidden' })
      let body = ''; for await (const ch of req) { body += ch; if (body.length > 36_000_000) return send(413, { error: 'too large' }) }
      const b = (() => { try { return JSON.parse(body || '{}') } catch { return {} } })()
      if (route === 'install') { void appInstall(typeof b.engine === 'string' ? b.engine : ''); return send(202, { ok: true }) }
      if (route === 'login-claude') { if (!appState.running) void (async () => { appState.running = true; try { appState.step = 'Connexion à Claude : termine dans la page du navigateur qui s’ouvre…'; await loginClaude() } finally { appState.running = false; appState.step = '' } })(); return send(202, { ok: true }) }
      if (route === 'open-flow') { const p = appState.pair; openWindow(p ? p.url : `${cfg().server}/app`); return send(200, { ok: true }) }
      if (route === 'open-url') { const x = String(b.url ?? ''); if (/^https:\/\/[^\s"'<>\\]+$/.test(x) || LOCAL_URL.test(x)) openWindow(x); return send(200, { ok: true }) }
      if (route === 'start') {
        if (readyIssues().length) return send(409, { error: 'not ready', issues: readyIssues() })
        const c = readJson(CONFIG, {}); c.started = true; saveCfg(c)
        return send(200, { ok: true })
      }
      if (['message', 'control', 'answer', 'open-folder', 'open-claude', 'attach'].includes(route)) return send(200, await localAction(route, b))
      return send(404, { error: 'not found' })
    } catch (e) { log('ui-http', e.message); send(500, { error: 'server' }) }
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const url = `http://127.0.0.1:${server.address().port}/t/${token}/`
  writeUiJson(kind, url)
  process.on('exit', () => { const u = readJson(UI_JSON, null); if (u?.pid === process.pid) { try { rmSync(UI_JSON) } catch {} } })
  return { server, url }
}

const UI_HTML = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Flow Studio</title>
<style>
:root{--bg:#f4f4f7;--card:#fff;--text:#15151a;--mute:#6b6b78;--line:#e4e4ea;--acc:#4d59c7;--acct:#fff;--ok:#15803d;--bad:#c4262f;--warn:#a16207;--soft:#eceefb;--me:#15151a;--met:#fff}
@media(prefers-color-scheme:dark){:root{--bg:#0e0e12;--card:#18181f;--text:#f2f2f5;--mute:#9a9aa8;--line:#2a2a34;--acc:#8b94ff;--acct:#0e0e12;--ok:#4ade80;--bad:#f87171;--warn:#fbbf24;--soft:#20233f;--me:#f2f2f5;--met:#0e0e12}}
[hidden]{display:none!important}*{box-sizing:border-box}html,body{margin:0;height:100%}
body{font:14px/1.45 -apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif;background:var(--bg);color:var(--text);overflow:hidden}
button{font:inherit;font-weight:600;border:0;border-radius:10px;padding:8px 14px;cursor:pointer;background:var(--acc);color:var(--acct)}
button.g{background:transparent;color:var(--text);border:1px solid var(--line)}button.s{padding:5px 10px;font-size:12px}
button:disabled{opacity:.45;cursor:not-allowed}button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:3px solid var(--acc);outline-offset:2px}
.mute{color:var(--mute)}.small{font-size:12px}
#app{position:fixed;inset:0;display:flex;flex-direction:column}
/* barre */
#bar{display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--card);border-bottom:1px solid var(--line);flex-wrap:wrap}
#bar .logo{font-weight:700;font-size:15px;margin-right:6px}
#bar select{font:inherit;padding:6px 8px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--text);max-width:260px}
.pg{flex:1;min-width:120px;max-width:300px;height:8px;border-radius:99px;background:var(--line);overflow:hidden}.pg i{display:block;height:100%;background:var(--acc);border-radius:99px;transition:width 1s linear}
.badge{font-size:12px;font-weight:700;padding:3px 10px;border-radius:99px;background:var(--soft);color:var(--acc)}
.badge.ok{color:var(--ok)}.badge.bad{color:var(--bad)}.badge.warn{color:var(--warn)}
.sp{flex:1}
/* studio */
#studio{flex:1;min-height:0;display:grid;grid-template-columns:minmax(300px,38%) 1fr;gap:12px;padding:12px}
.pane{background:var(--card);border:1px solid var(--line);border-radius:14px;min-height:0;display:flex;flex-direction:column;overflow:hidden}
.pane>h3{margin:0;padding:9px 14px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--mute);border-bottom:1px solid var(--line);display:flex;align-items:center;gap:8px}
#feed{flex:1;min-height:0;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:9px}
.m{max-width:94%;padding:8px 12px;border-radius:14px;white-space:pre-wrap;word-wrap:break-word}
.m.claude{background:var(--bg);border-top-left-radius:4px;align-self:flex-start}
.m.user{background:var(--me);color:var(--met);border-top-right-radius:4px;align-self:flex-end}
.tl{font:11.5px/1.35 ui-monospace,Menlo,monospace;color:var(--mute);padding:1px 4px;word-break:break-all}
.sys{align-self:center;text-align:center;font-size:12px;color:var(--mute)}.sys.error{color:var(--bad)}.sys.success{color:var(--ok);font-weight:600}.sys.warning{color:var(--warn)}
.qb{border:1px solid var(--warn);background:var(--soft);border-radius:12px;padding:10px 12px;margin:0 14px 10px}
.qb .ch{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
#comp{border-top:1px solid var(--line);padding:10px 12px;display:grid;gap:8px}
#comp textarea{width:100%;min-height:62px;max-height:160px;resize:vertical;font:inherit;padding:8px 10px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--text)}
#comp .r{display:flex;gap:8px;align-items:center;flex-wrap:wrap}#comp select{font:inherit;padding:6px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--text)}
#right{display:grid;grid-template-rows:auto minmax(0,1fr);gap:12px;min-height:0}
#two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
#two .pane{max-height:250px}.scr{overflow-y:auto;padding:8px 14px}
.st{display:flex;gap:10px;align-items:flex-start;padding:5px 0}
.dot{flex:none;width:18px;height:18px;border-radius:50%;border:2px solid var(--line);display:flex;align-items:center;justify-content:center;font-size:10px;margin-top:1px}
.dot.done{background:var(--acc);border-color:var(--acc);color:var(--acct)}.dot.active{border-color:var(--acc);border-top-color:transparent;animation:sp 1s linear infinite}.dot.blocked{border-color:var(--warn)}
.st.todo .t,.tdo.todo .t{color:var(--mute)}.tdo{display:flex;gap:9px;align-items:flex-start;padding:4px 6px;border-radius:8px}.tdo.doing{background:var(--soft)}
.tdo .bx{flex:none;width:16px;height:16px;border-radius:5px;border:2px solid var(--line);margin-top:1px;display:flex;align-items:center;justify-content:center;font-size:11px}
.tdo.done .bx{background:var(--ok);border-color:var(--ok);color:#fff}.tdo.done .t{text-decoration:line-through;color:var(--mute)}
@keyframes sp{to{transform:rotate(360deg)}}
#prev{min-height:0}#tabs{display:flex;gap:6px;padding:7px 10px;border-bottom:1px solid var(--line);align-items:center}
#tabs button{padding:5px 12px;font-size:12px}#tabs button.on{background:var(--acc);color:var(--acct)}#tabs button:not(.on){background:transparent;color:var(--text);border:1px solid var(--line)}
#pv{flex:1;min-height:0;position:relative;background:#fff}#pv iframe,#pv img{position:absolute;inset:0;width:100%;height:100%;border:0;object-fit:contain;background:#fff}
#pv .none{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:20px;color:var(--mute);background:var(--card)}
#done{padding:12px 14px;border-top:1px solid var(--line);max-height:42%;overflow-y:auto;background:var(--soft)}
#done h4{margin:0 0 6px;font-size:14px}#done .md h5{margin:10px 0 3px;font-size:13px}#done .md li{margin:2px 0 2px 16px}#done .md p{margin:4px 0}
.lk{color:var(--acc);text-decoration:underline;cursor:pointer;word-break:break-all;background:none;border:0;padding:0;font-weight:600}
/* assistant */
#wiz{position:fixed;inset:0;background:var(--bg);overflow-y:auto;transition:opacity .9s ease;z-index:5}#wiz.fade{opacity:0;pointer-events:none}
#wiz main{max-width:640px;margin:0 auto;padding:28px 20px 40px}h1{font-size:24px;margin:0 0 4px}.sub{color:var(--mute);margin:0 0 20px}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px 20px;margin-bottom:14px}
.card h2{font-size:14px;margin:0 0 12px;display:flex;align-items:center;gap:10px}
.n{display:inline-flex;width:24px;height:24px;border-radius:50%;background:var(--line);align-items:center;justify-content:center;font-size:12px;font-weight:600}.n.ok{background:var(--ok);color:#fff}
.code{font:600 30px/1.1 ui-monospace,Menlo,monospace;letter-spacing:.06em;text-align:center;padding:14px;border-radius:12px;background:var(--bg);border:1px dashed var(--line);user-select:all}
.row{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}ul{list-style:none;margin:0;padding:0}
li.it{display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid var(--line)}li.it:first-child{border-top:0}.nm{flex:1;min-width:0}.nm small{display:block;color:var(--mute);font-size:12px}
.b{font-size:12px;font-weight:600;padding:3px 9px;border-radius:99px;background:var(--bg);color:var(--mute);white-space:nowrap}.b.ok{color:var(--ok)}.b.bad{color:var(--bad)}.b.warn{color:var(--warn)}.b.busy{color:var(--acc)}
.bar{height:6px;border-radius:99px;background:var(--line);overflow:hidden;margin-top:12px}.bar i{display:block;height:100%;background:var(--acc);transition:width .5s}
.eng{margin:12px 0 0;padding:12px;border:1px solid var(--line);border-radius:12px}.eng label{display:flex;gap:10px;align-items:flex-start;padding:6px 0;cursor:pointer}
.err{color:var(--bad);font-size:13px;margin-top:10px}.ok-t{color:var(--ok);font-weight:600}#go{width:100%;padding:15px;font-size:17px}
body{opacity:0;transition:opacity .6s}body.on{opacity:1}
#home{flex:1;min-height:0;overflow-y:auto;padding:18px 20px}#home h2{margin:0 0 4px;font-size:20px}#home .hs{color:var(--mute);margin:0 0 14px}
#hg{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
.pc{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:9px;cursor:pointer;text-align:left}
.pc:hover{border-color:var(--acc)}.pc .t{font-weight:700;font-size:15px;word-break:break-word}.pc .m{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.pc .pg{max-width:none;flex:none;width:100%}.pc .a{display:flex;gap:8px;flex-wrap:wrap;margin-top:2px}
.kd{font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--mute)}
.emp{padding:40px 10px;text-align:center;color:var(--mute)}
@media(max-width:820px){#studio{grid-template-columns:1fr;overflow-y:auto;display:block}#studio>section.pane,#right{margin-bottom:12px}#studio>section.pane{height:70vh}#two{grid-template-columns:1fr}#prev{height:70vh}}
@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
</style></head><body><div id="app">
<div id="bar" hidden><span class="logo">Flow Studio</span><button class="g s" id="bHome">Accueil</button><select id="sel" aria-label="Projet"></select><span class="badge" id="stt"></span>
<div class="pg" role="progressbar" aria-label="Avancement" aria-valuemin="0" aria-valuemax="100" id="pgw"><i id="pgi" style="width:0%"></i></div><span class="mute small" id="pct"></span><span class="mute small" id="stp"></span><span class="sp"></span>
<button class="g s" id="bPause">Pause</button><button class="g s" id="bCancel">Annuler</button><button class="g s" id="bDir">Dossier</button><button class="g s" id="bCC" title="Ouvre une discussion Claude Code (Terminal) qui connaît déjà ce projet">Ouvrir dans Claude Code</button><button class="g s" id="bSet">Logiciels</button></div>
<div id="home" hidden><h2>Projets</h2><p class="hs">Tous tes projets et leur état. Clique sur un projet pour le suivre.</p><div id="hg"></div></div>
<div id="studio" hidden>
 <section class="pane" aria-label="Discussion"><h3>Discussion avec Claude</h3><div id="feed" aria-live="polite" tabindex="0"></div><div id="qz"></div>
  <div id="comp"><textarea id="msg" placeholder="Écris à Claude : correction, idée, nouvelle demande…" aria-label="Message à Claude"></textarea>
   <div class="r"><select id="mode" aria-label="Quand"><option value="next">Après l’étape</option><option value="now">Maintenant</option><option value="after">À la fin</option></select><button class="g s" id="att">Joindre</button><input type="file" id="fi" multiple hidden><span class="sp"></span><button id="snd">Envoyer</button></div><div class="mute small" id="atl"></div></div></section>
 <div id="right"><div id="two"><section class="pane" aria-label="Étapes"><h3>Étapes</h3><div class="scr" id="steps"></div></section><section class="pane" aria-label="Tâches"><h3>Tâches de Claude <span id="tc"></span></h3><div class="scr" id="todo"></div></section></div>
  <section class="pane" id="prev" aria-label="En direct"><div id="tabs"><button id="tSite">Page du site</button><button id="tEd">Montage</button><span class="sp"></span><button class="g s" id="rl" title="Recharger la page">↻</button><button class="g s" id="ext" title="Ouvrir dans le navigateur">Ouvrir</button></div><div id="pv"></div><div id="done" hidden></div></section></div>
</div>
<div id="wiz"><main>
<h1>Flow Studio</h1><p class="sub">Trois étapes, tout est automatique.</p>
<section class="card" aria-labelledby="h1"><h2 id="h1"><span class="n" id="n1">1</span>Relier ce Mac à Flow</h2><div id="pair"></div></section>
<section class="card" aria-labelledby="h2"><h2 id="h2"><span class="n" id="n2">2</span>Logiciels du Mac</h2><div id="soft"></div></section>
<section class="card" aria-labelledby="h3"><h2 id="h3"><span class="n" id="n3">3</span>Prêt ?</h2><button id="go" disabled>Commencer</button><p class="mute" id="why" aria-live="polite"></p></section></main></div>
</div>
<script>
var T=location.pathname,$=function(i){return document.getElementById(i)};
function post(r,b){return fetch(T+r,{method:'POST',headers:{'x-flow':'1','content-type':'application/json'},body:JSON.stringify(b||{})}).then(function(x){return x.json().catch(function(){return{}})})}
function get(r){return fetch(T+r,{cache:'no-store'}).then(function(x){if(!x.ok)throw new Error(x.status);return x.json()})}
function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e}
var showAll=false,S=null,cur=null,lastN=0,jobId=null,engine='effectcraft',starting=false,showWiz=true,view='wiz',siteShown='',tab='site',edAt=0,att=[];
var LBL={ok:'Installé',missing:'À installer',warn:'À connecter',installing:'En cours…',waiting:'En attente',error:'Échec'},CLS={ok:'ok',missing:'bad',warn:'warn',installing:'busy',waiting:'busy',error:'bad'};
var STT={draft:'Brouillon',starting:'Démarrage',running:'En cours',paused:'En pause',needs_answer:'Question',done:'Terminé',failed:'Échec',cancelled:'Annulé',queued:'En attente'};
/* ---------- assistant ---------- */
var wizSig='',homeSig='',stSig='',tdSig='',qSig='';
function renderWiz(s){var sg=JSON.stringify(s)+engine+showAll+starting;if(sg===wizSig)return;wizSig=sg;
 var p=$('pair');p.textContent='';$('n1').className='n'+(s.paired?' ok':'');$('n1').textContent=s.paired?'✓':'1';
 if(s.paired){p.appendChild(el('p','ok-t','Ce Mac est relié à ton compte Flow.'))}
 else if(s.pair){p.appendChild(el('p','mute','Entre ce code dans Flow (Création de site → Connexion du Mac), ou clique sur « Ouvrir Flow » : le Mac se relie tout seul si tu es connecté.'));
  p.appendChild(el('div','code',s.pair.code));var r=el('div','row');
  var b1=el('button',null,'Ouvrir Flow');b1.onclick=function(){post('open-flow')};r.appendChild(b1);
  var b2=el('button','g','Copier le code');b2.onclick=function(){navigator.clipboard&&navigator.clipboard.writeText(s.pair.code);b2.textContent='Copié ✓'};r.appendChild(b2);p.appendChild(r);
  p.appendChild(el('p','mute small','Le code se renouvelle tout seul : tu peux garder cette fenêtre ouverte.'))}
 else p.appendChild(el('p','mute','Préparation du code…'));
 var so=$('soft');so.textContent='';
 if(!s.items.length){so.appendChild(el('p','mute','Vérification de ton Mac…'));return}
 var ul=el('ul');
 s.items.forEach(function(c){var li=el('li','it');var n=el('div','nm',c.name);var sm=c.state==='ok'?(c.version||''):c.detail;if(c.cost==='paid'&&c.state!=='ok')sm=(sm?sm+' · ':'')+'abonnement payant';if(sm)n.appendChild(el('small',null,sm));
  var opt=s.motionOk&&c.state!=='ok'&&['effectcraft','aftereffects','remotion'].indexOf(c.id)>=0;li.appendChild(n);li.appendChild(el('span','b '+(opt?'':(CLS[c.state]||'')),opt?'Facultatif':(LBL[c.state]||c.state)));ul.appendChild(li)});so.appendChild(ul);
 var missing=s.items.filter(function(c){return c.state!=='ok'&&['effectcraft','aftereffects','remotion'].indexOf(c.id)<0&&c.group!=='site'});
 if(!s.motionOk){var e=el('div','eng');e.appendChild(el('div','mute','Aucun moteur de motion design trouvé. Lequel installer ?'));
  [['effectcraft','EffectCraft','gratuit (recommandé)'],['remotion','Remotion','gratuit, vidéos par code'],['aftereffects','After Effects','abonnement Adobe payant, installation guidée']].forEach(function(o){var l=el('label');var i=el('input');i.type='radio';i.name='eng';i.value=o[0];i.checked=engine===o[0];i.onchange=function(){engine=o[0]};l.appendChild(i);var d=el('div',null,o[1]);d.appendChild(el('small','mute',' — '+o[2]));l.appendChild(d);e.appendChild(l)});so.appendChild(e)}
 var claudeWarn=s.items.some(function(c){return c.id==='claude'&&c.state==='warn'});
 var need=!s.motionOk||missing.length>0||claudeWarn;
 var row=el('div','row');var bi=el('button',null,need?'Installer ce qui manque':'Tout est installé ✓');bi.disabled=s.running||!need;bi.onclick=function(){post('install',{engine:s.motionOk?'':engine})};row.appendChild(bi);
 if(!need&&!s.running){ul.hidden=!showAll;var tg=el('button','g s',showAll?'Masquer le détail':'Voir le détail');tg.onclick=function(){showAll=!showAll;renderWiz(S)};row.appendChild(tg)}so.appendChild(row);
 if(s.running||s.step){so.appendChild(el('p','mute',s.step||''));if(s.pct!=null){var bar=el('div','bar');var i2=el('i');i2.style.width=s.pct+'%';bar.appendChild(i2);so.appendChild(bar)}}
 if(s.error)so.appendChild(el('p','err',s.error));
 var done=s.items.length&&!need&&!s.running;$('n2').className='n'+(done?' ok':'');$('n2').textContent=done?'✓':'2';
 var g=$('go');g.disabled=!s.ready||starting;var w=$('why');w.textContent=s.ready?'Tout est prêt : Flow Studio va s’ouvrir.':s.issues.join(' ');$('n3').className='n'+(s.ready?' ok':'')}
/* ---------- studio ---------- */
function md(t){var box=el('div','md');var lines=String(t||'').split('\\n');var tick=String.fromCharCode(96);
 function inline(parent,x){x=x.split(tick).join('');var parts=x.split(/(\\*\\*[^*]+\\*\\*|https?:\\/\\/[^\\s)]+)/);parts.forEach(function(p){if(!p)return;if(p.indexOf('**')===0&&p.slice(-2)==='**'){parent.appendChild(el('strong',null,p.slice(2,-2)))}else if(/^https?:/.test(p)){var b=el('button','lk',p);b.onclick=function(){post('open-url',{url:p})};parent.appendChild(b)}else parent.appendChild(document.createTextNode(p))})}
 lines.forEach(function(l){if(!l.trim())return;var m=/^#{1,4}\\s+(.*)/.exec(l);if(m){var h=el('h5');inline(h,m[1]);box.appendChild(h)}else if(/^\\s*[-*]\\s+/.test(l)){var li=el('li');inline(li,l.replace(/^\\s*[-*]\\s+/,''));box.appendChild(li)}else if(/^\\|/.test(l)){if(/^\\|[\\s:-|]+$/.test(l))return;var p2=el('p');inline(p2,l.replace(/^\\||\\|$/g,'').split('|').map(function(c){return c.trim()}).join('  ·  '));box.appendChild(p2)}else{var p3=el('p');inline(p3,l);box.appendChild(p3)}});return box}
function addEntry(e){var f=$('feed'),n;
 if(e.k==='claude'){n=el('div','m claude',e.text)}else if(e.k==='user'){n=el('div','m user',e.text)}
 else if(e.k==='tool'){n=el('div','tl','› '+e.text)}else if(e.k==='question'){n=el('div','sys warning','Question : '+e.text)}
 else{n=el('div','sys '+(e.level||''),e.text)}
 f.appendChild(n)}
function renderJob(j){
 cur=j;$('stt').textContent=STT[j.status]||j.status;$('stt').className='badge'+(j.status==='done'?' ok':j.status==='failed'?' bad':j.status==='paused'||j.status==='needs_answer'?' warn':'');
 $('pgi').style.width=j.progress+'%';$('pgw').setAttribute('aria-valuenow',j.progress);$('pct').textContent=j.progress+' %';
 var cs=j.steps.filter(function(x){return x.state==='active'||x.state==='blocked'})[0];$('stp').textContent=cs?cs.label:'';
 var act=['starting','running','needs_answer'].indexOf(j.status)>=0;$('bPause').textContent=j.status==='paused'?'Reprendre':'Pause';$('bPause').hidden=!(act||j.status==='paused');$('bCancel').hidden=!(act||j.status==='paused');
 $('bCC').hidden=false;
 var f=$('feed'),near=f.scrollHeight-f.scrollTop-f.clientHeight<80;if(!f.childNodes.length&&!j.transcript.length&&lastN===0){f.appendChild(el('div','sys','Pas encore d’activité enregistrée sur ce Mac pour ce projet. Elle apparaît ici dès que Claude travaille dessus.'))}if(j.transcript.length&&f.firstChild&&f.firstChild.className==='sys'&&lastN===0)f.textContent='';j.transcript.forEach(function(e){addEntry(e);lastN=Math.max(lastN,e.n)});if(near&&j.transcript.length)f.scrollTop=f.scrollHeight;
 if((JSON.stringify(j.steps))!==stSig){stSig=JSON.stringify(j.steps);var st=$('steps');st.textContent='';j.steps.forEach(function(x){var r=el('div','st '+x.state);var d=el('span','dot '+x.state,x.state==='done'?'✓':'');r.appendChild(d);r.appendChild(el('span','t',x.label));st.appendChild(r)});}
 if((JSON.stringify(j.todo))!==tdSig){tdSig=JSON.stringify(j.todo);var td=$('todo');td.textContent='';var dn=j.todo.filter(function(x){return x.state==='done'}).length;$('tc').textContent=j.todo.length?dn+' / '+j.todo.length:'';
 if(!j.todo.length)td.appendChild(el('p','mute small','La liste arrive dès que Claude a planifié le travail.'));
 j.todo.forEach(function(x){var r=el('div','tdo '+x.state);r.appendChild(el('span','bx',x.state==='done'?'✓':''));r.appendChild(el('span','t',x.text));td.appendChild(r)});}
 if((JSON.stringify(j.questions))!==qSig){qSig=JSON.stringify(j.questions);var qz=$('qz');qz.textContent='';j.questions.forEach(function(q){var b=el('div','qb');b.appendChild(el('strong',null,'Claude te pose une question'));b.appendChild(el('div',null,q.text));
  if(q.choices){var c=el('div','ch');q.choices.forEach(function(x){var bb=el('button','g s',x);bb.onclick=function(){post('answer',{jobId:j.id,qid:q.id,text:x})};c.appendChild(bb)});b.appendChild(c)}
  var i=el('input');i.placeholder='Ta réponse…';i.setAttribute('aria-label','Réponse');i.style.cssText='width:70%;padding:6px 8px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--text)';var ok=el('button','s','Répondre');ok.style.marginLeft='6px';
  ok.onclick=function(){if(i.value.trim())post('answer',{jobId:j.id,qid:q.id,text:i.value.trim()})};b.appendChild(i);b.appendChild(ok);qz.appendChild(b)});}
 var pv=$('pv');
 if(j.siteUrl&&siteShown!==j.siteUrl){siteShown=j.siteUrl;if(tab!=='ed')tab='site'}
 $('tSite').hidden=!j.siteUrl&&j.kind!=='site';$('tSite').className=tab==='site'?'on':'';$('tEd').className=tab==='ed'?'on':'';$('ext').hidden=tab!=='site'||!j.siteUrl;$('rl').hidden=tab!=='site'||!j.siteUrl;
 if(tab==='site'){var ifr=pv.querySelector('iframe');if(j.siteUrl){if(!ifr||ifr.getAttribute('data-u')!==j.siteUrl){pv.textContent='';ifr=el('iframe');ifr.setAttribute('data-u',j.siteUrl);ifr.src=j.siteUrl;ifr.title='Page du site (cliquable)';pv.appendChild(ifr)}}else{pv.textContent='';pv.appendChild(el('div','none','La page du site apparaît ici dès que Claude lance le serveur local. Tu pourras cliquer, défiler et naviguer dedans.'))}}
 else{var im=pv.querySelector('img');if(j.editorAt){if(!im||im.getAttribute('data-t')!==String(j.editorAt)){pv.textContent='';im=el('img');im.setAttribute('data-t',j.editorAt);im.alt='Logiciel de montage';im.src=T+'editor.jpg?t='+j.editorAt;pv.appendChild(im)}}else{pv.textContent='';pv.appendChild(el('div','none','Ouvre EffectCraft ou After Effects : sa fenêtre apparaît ici en direct.'))}}
 var dn2=$('done');if(j.status==='done'&&(j.deliverUrl||j.summary)){dn2.hidden=false;if(dn2.getAttribute('data-k')!==j.deliverUrl+j.summary.length){dn2.setAttribute('data-k',j.deliverUrl+j.summary.length);dn2.textContent='';dn2.appendChild(el('h4',null,'Terminé'));if(j.deliverUrl){var lb=el('button','lk',j.deliverUrl);lb.onclick=function(){post('open-url',{url:j.deliverUrl})};dn2.appendChild(lb)}dn2.appendChild(md(j.summary))}}else dn2.hidden=true}
function renderSel(list){var s=$('sel'),v=s.value||jobId;s.textContent='';list.forEach(function(j){var o=el('option',null,j.title+' · '+(STT[j.status]||j.status));o.value=j.id;s.appendChild(o)});
 if(!list.length){var o=el('option',null,'Aucun projet');o.value='';s.appendChild(o);$('stt').textContent='';return}
 if(!jobId||!list.some(function(j){return j.id===jobId})){var a=list.filter(function(j){return ['running','starting','needs_answer','paused'].indexOf(j.status)>=0})[0]||list[0];jobId=a.id;lastN=0;$('feed').textContent='';siteShown=''}
 s.value=jobId}
function setView(v){view=v;var main=v==='home'||v==='job';$('bar').hidden=!main;$('studio').hidden=v!=='job';$('home').hidden=v!=='home';$('wiz').classList.toggle('fade',main);
 var job=v==='job';['sel','stt','pgw','pct','stp','bPause','bCancel','bDir','bCC'].forEach(function(i){var e=$(i);if(e)e.style.display=job?'':'none'});$('bHome').style.display=v==='job'?'':'none'}
var KIND={site:'Site',motion:'Motion design'};
function renderHome(list){var sg=JSON.stringify(list);if(sg===homeSig)return;homeSig=sg;var g=$('hg');g.textContent='';
 if(!list.length){g.appendChild(el('div','emp','Aucun projet pour le moment. Lance un projet depuis Flow : il apparaît ici avec son état.'));return}
 var order={running:0,starting:0,needs_answer:0,paused:1,queued:1,draft:2,failed:3,cancelled:4,done:5};
 list.slice().sort(function(a,b){return (order[a.status]!=null?order[a.status]:6)-(order[b.status]!=null?order[b.status]:6)||b.createdAt-a.createdAt}).forEach(function(j){
  var c=el('div','pc');c.tabIndex=0;c.setAttribute('role','button');c.setAttribute('aria-label','Ouvrir '+j.title);
  c.appendChild(el('span','kd',KIND[j.kind]||j.kind));c.appendChild(el('div','t',j.title));
  var m=el('div','m');var b=el('span','badge'+(j.status==='done'?' ok':j.status==='failed'?' bad':j.status==='paused'||j.status==='needs_answer'?' warn':''),STT[j.status]||j.status);m.appendChild(b);
  if(j.stepLabel&&j.status!=='done')m.appendChild(el('span','mute small',j.stepLabel));if(j.todoTotal)m.appendChild(el('span','mute small',j.todoDone+' / '+j.todoTotal+' tâches'));c.appendChild(m);
  var pg=el('div','pg');var i=el('i');i.style.width=j.progress+'%';pg.appendChild(i);c.appendChild(pg);
  var a=el('div','a');var o=el('button','s','Ouvrir');o.onclick=function(e){e.stopPropagation();openJob(j.id)};a.appendChild(o);
  if(j.deliverUrl){var l=el('button','g s','Voir le site');l.onclick=function(e){e.stopPropagation();post('open-url',{url:j.deliverUrl})};a.appendChild(l)}
  var cc=el('button','g s','Ouvrir dans Claude Code');cc.onclick=function(e){e.stopPropagation();post('open-claude',{jobId:j.id})};if(j.hasDir)a.appendChild(cc);c.appendChild(a);
  c.onclick=function(){openJob(j.id)};c.onkeydown=function(e){if(e.key==='Enter')openJob(j.id)};g.appendChild(c)})}
function openJob(id){jobId=id;lastN=0;$('feed').textContent='';siteShown='';cur=null;setView('job')}
var lastFocus=0;
function tick(){get('state').then(function(s){S=s;renderWiz(s);
  if(s.focus&&s.focus.t!==lastFocus){var first=lastFocus===0;lastFocus=s.focus.t;if(!first||s.paired){if(s.paired&&s.started)openJob(s.focus.jobId)}}
  if(!s.paired&&view!=='wiz'){view='wiz';starting=false;setView('wiz')}
  var wantMain=s.paired&&s.started&&view==='wiz';if(wantMain)setView('home');
  if(view==='home')renderHome(s.jobs);
  if(view==='job'){renderSel(s.jobs)}
  $('bSet').hidden=false;
  if(view!=='job'||!jobId)return;return get('job/'+jobId+'?after='+lastN).then(renderJob)}).catch(function(){}).then(function(){setTimeout(tick,1000)})}
$('sel').onchange=function(){jobId=this.value;lastN=0;$('feed').textContent='';siteShown=''};
$('bPause').onclick=function(){if(!cur)return;post('control',{jobId:cur.id,action:cur.status==='paused'?'resume':'pause'})};
$('bCancel').onclick=function(){if(cur&&confirm('Annuler ce projet ?'))post('control',{jobId:cur.id,action:'cancel'})};
$('bDir').onclick=function(){if(cur)post('open-folder',{jobId:cur.id})};$('bCC').onclick=function(){if(cur)post('open-claude',{jobId:cur.id})};
$('bHome').onclick=function(){setView('home')};
$('bSet').onclick=function(){if(view==='home'||view==='job'){view='wiz-forced';$('bar').hidden=false;$('wiz').classList.remove('fade')}};
$('tSite').onclick=function(){tab='site';siteShown='';if(cur)renderJob({...cur,transcript:[]})};$('tEd').onclick=function(){tab='ed';if(cur)renderJob({...cur,transcript:[]})};
$('rl').onclick=function(){var f=$('pv').querySelector('iframe');if(f)f.src=f.getAttribute('data-u')};$('ext').onclick=function(){if(cur&&cur.siteUrl)post('open-url',{url:cur.siteUrl})};
$('att').onclick=function(){$('fi').click()};
$('fi').onchange=function(){var fs=Array.prototype.slice.call(this.files);var jid=jobId;fs.forEach(function(f){var r=new FileReader();r.onload=function(){var d=String(r.result).split(',')[1]||'';post('attach',{jobId:jid,name:f.name,data:d}).then(function(x){if(x.path){att.push(x.path);$('atl').textContent='Joint : '+att.join(', ')}})};r.readAsDataURL(f)});this.value=''};
function sendMsg(){var t=$('msg').value.trim();if((!t&&!att.length)||!jobId)return;if(att.length)t+='\\n\\nFichiers joints (dans le projet) : '+att.join(', ');post('message',{jobId:jobId,text:t,mode:$('mode').value}).then(function(){$('msg').value='';att=[];$('atl').textContent=''})}
$('snd').onclick=sendMsg;$('msg').onkeydown=function(e){if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();sendMsg()}};
$('go').onclick=function(){if(starting)return;starting=true;$('go').disabled=true;post('start').then(function(r){if(r.error){starting=false;return}view='wiz';setView('home')})};
requestAnimationFrame(function(){document.body.classList.add('on')});tick();
</script></body></html>`

async function appMode() {
  const prev = readUiJson()
  if (prev && prev.pid !== process.pid) { if (!process.env.FLOW_APP_HOST) openAppWindow(prev.url); return } // déjà en marche : la fenêtre suit ui.json
  const { url } = await startUiServer('wizard')
  if (cfg().deviceToken) { try { await api('GET', 'bridge/me') } catch (e) { if (e.status === 401) { const c0 = readJson(CONFIG, {}); delete c0.deviceToken; delete c0.started; saveCfg(c0) } } } // jeton périmé : on repart d'un code
  if (process.env.FLOW_BRIDGE_APP_URL_FILE) writeFileSync(process.env.FLOW_BRIDGE_APP_URL_FILE, url)
  if (!process.env.FLOW_APP_HOST && (!FAKE_ENV() || process.env.FLOW_BRIDGE_OPEN_APP === '1')) openAppWindow(url) // sans l'application native : fenêtre du navigateur
  void appPairing()
  setTimeout(() => void refreshScan({ post: false }), 50)
  setInterval(() => { const u = readUiJson(); if (u && u.pid !== process.pid && u.kind === 'service') setTimeout(() => process.exit(0), 20_000) }, 2000) // le service (lancé après la liaison) prend le relais
  setInterval(() => { if (Date.now() - LOCAL.uiSeen > 30 * 60_000) process.exit(0) }, 60_000) // fenêtre fermée depuis 30 min : on s'arrête
  setInterval(() => { if (!appState.running) void refreshScan({ post: appState.paired }) }, 60_000)
  await new Promise(() => {})
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
  if (process.env.FLOW_BRIDGE_HOME) { log('install ignoré (dossier de test)'); return } // un test ne doit jamais remplacer le vrai service du Mac
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
  let same = false
  try { same = readFileSync(PLIST, 'utf8') === xml && execFileSync('launchctl', ['list', 'site.flow.bridge'], { stdio: 'pipe' }).length > 0 } catch {}
  if (same) return // déjà installé et en marche : on ne le redémarre pas (la fenêtre Flow Studio est servie par ce service)
  mkdirSync(path.dirname(PLIST), { recursive: true }); writeFileSync(PLIST, xml)
  try { execFileSync('launchctl', ['unload', PLIST], { stdio: 'ignore' }) } catch {}
  execFileSync('launchctl', ['load', '-w', PLIST])
  console.log('Service installé : le pont démarre avec le Mac et empêche la mise en veille tant qu\'il tourne.')
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
else if (cmd === 'app') await appMode()
else if (cmd === 'install') install()
else if (cmd === 'open') { if (!openStudio(process.argv[3])) openStudio() }
else if (cmd === 'uninstall') uninstall()
else if (cmd === 'logs') console.log(readdirSync(DIR).includes('bridge.log') ? readFileSync(LOG, 'utf8').split('\n').slice(-60).join('\n') : '(aucun journal)')
else console.log('Usage : node flow-bridge.mjs setup | doctor | connect | start | status | install | uninstall | logs\nVariables : FLOW_SERVER (adresse de Flow), FLOW_DEVICE_NAME, FLOW_BRIDGE_HOME')
