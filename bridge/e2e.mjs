#!/usr/bin/env node
// Test de bout en bout du système Studio : serveur Flow (STUDIO_STORE=file) + pont + faux Claude.
//   STUDIO_STORE=file npm run dev -- -p 3100   puis   node bridge/e2e.mjs
import { spawn } from 'node:child_process'
import { request as httpRequest } from 'node:http'
import { mkdtempSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
const require_ls = (d) => readdirSync(d)
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = process.env.FLOW_SERVER || 'http://localhost:3100'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const home = mkdtempSync(path.join(tmpdir(), 'fb-'))
const COOKIE = { cookie: 'flow_demo=1', 'content-type': 'application/json' }
let ok = 0, bad = 0
const check = (name, cond, extra = '') => { if (cond) { ok++; console.log(`  ✓ ${name}`) } else { bad++; console.log(`  ✗ ${name} ${extra}`) } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const api = async (m, p, b) => { const r = await fetch(`${BASE}/api/studio/${p}`, { method: m, headers: COOKIE, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, ...(await r.json().catch(() => ({}))) } }
async function until(label, fn, ms = 40000) { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await sleep(400) } check(label, false, '(timeout)'); throw new Error('timeout ' + label) }

const env = { ...process.env, FLOW_SERVER: BASE, FLOW_BRIDGE_HOME: home, FLOW_DEVICE_NAME: 'Mac de test', FLOW_BRIDGE_VERBOSE: '' }
console.log('1. appairage')
const conn = spawn('node', [path.join(HERE, '..', 'public', 'studio', 'flow-bridge.mjs'), 'connect'], { env })
let outTxt = ''; conn.stdout.on('data', (d) => (outTxt += d))
const code = await until('code affiché', () => outTxt.match(/FLOW-[A-Z0-9]{4}-[A-Z0-9]{4}/)?.[0])
const bad1 = await api('POST', 'pair/confirm', { code: 'FLOW-AAAA-BBBB' }); check('mauvais code refusé', bad1.status === 404)
const conf = await api('POST', 'pair/confirm', { code }); check('code accepté', conf.status === 200 && conf.device?.name === 'Mac de test', JSON.stringify(conf))
await until('jeton reçu par le Mac', () => existsSync(path.join(home, 'config.json')) && JSON.parse(readFileSync(path.join(home, 'config.json'), 'utf8')).deviceToken)
const again = await api('POST', 'pair/confirm', { code }); check('code à usage unique', again.status === 404)
const cfg = JSON.parse(readFileSync(path.join(home, 'config.json'), 'utf8'))
const work = path.join(home, 'work')
Object.assign(cfg, { claudeBin: 'node', claudeArgsPrefix: [path.join(HERE, 'fake-claude.mjs')], motionRoot: path.join(work, 'motion'), sitesRoot: path.join(work, 'sites'), atelier: work })
writeFileSync(path.join(home, 'config.json'), JSON.stringify(cfg))

console.log('2. pont démarré')
const bridge = spawn('node', [path.join(HERE, '..', 'public', 'studio', 'flow-bridge.mjs'), 'start'], { env: { ...env, FAKE_STEP_MS: '1300' }, stdio: 'ignore' })
await until('Mac en ligne', async () => (await api('GET', 'devices')).devices?.[0]?.online)
check('appareil visible', true)

console.log('3. motion : création, fichier, envoi')
const prompt = 'x'.repeat(80) + ' Mission : motion design de test'
const { job } = await api('POST', 'jobs', { kind: 'motion', title: 'Test motion', spec: { ratio: '16:9' }, prompt })
check('job créé', !!job?.id)
const reg = await api('POST', `jobs/${job.id}/assets`, { name: 'ref.txt', size: 5, mime: 'text/plain', kind: 'file' })
check('lien d\'envoi fourni', !!reg.upload?.url)
const put = await fetch(reg.upload.url, { method: 'PUT', body: 'hello' }); check('fichier envoyé', put.ok)
await api('PATCH', `jobs/${job.id}/assets`, { assetId: reg.asset.id })
const sub = await api('POST', `jobs/${job.id}/submit`); check('demande envoyée', sub.job?.status === 'queued', JSON.stringify(sub).slice(0, 200))

console.log('4. exécution, question, messages')
const q = await until('question de Claude', async () => { const j = (await api('GET', `jobs/${job.id}`)).job; return j?.questions?.[0] ? j : null })
check('statut = question', ['needs_answer', 'running'].includes(q.status))
const a = await api('POST', `jobs/${job.id}/answer`, { questionId: q.questions[0].id, answer: 'Commencer' }); check('réponse acceptée', a.status === 200)
console.log('4a. tâches en direct')
const withTodo = await until('liste des tâches', async () => { const j = (await api('GET', `jobs/${job.id}`)).job; return j.todo?.length ? j : null })
check('tâches : une en cours', withTodo.todo.some((t) => t.state === 'doing'))
check('tâches : absentes du fil d\'activité', !withTodo.events.some((e) => e.kind === 'todo' || e.kind === 'preview'))
console.log('4a1. fenêtre locale Flow Studio')
const ui = await until('fenêtre locale prête', () => { try { return JSON.parse(readFileSync(path.join(home, 'ui.json'), 'utf8')) } catch { return null } })
const base = ui.url
const lget = async (r) => { const x = await fetch(base + r); return { status: x.status, body: await x.json().catch(() => ({})) } }
const lpost = (r, b, h = {}) => fetch(base + r, { method: 'POST', headers: { 'x-flow': '1', 'content-type': 'application/json', ...h }, body: JSON.stringify(b) }).then(async (x) => ({ status: x.status, ...(await x.json().catch(() => ({}))) }))
check('local : mauvais jeton refusé', (await fetch(base.replace(/\/t\/[^/]+\//, '/t/faux/') + 'state')).status === 404)
const badHost = await new Promise((resolve) => { const u = new URL(base + 'state'); const rq = httpRequest({ host: u.hostname, port: u.port, path: u.pathname, headers: { host: 'evil.example' } }, (r) => { r.resume(); resolve(r.statusCode) }); rq.on('error', () => resolve(0)); rq.end() })
check('local : mauvais hôte refusé (protection DNS rebinding)', badHost === 403, String(badHost))
check('local : POST sans en-tête refusé', (await fetch(base + 'message', { method: 'POST', body: '{}' })).status === 403)
check('local : POST d\'un autre site refusé', (await lpost('message', {}, { origin: 'https://evil.example' })).status === 403)
const ls = await lget('state'); check('local : projet listé', ls.body.jobs?.some((j) => j.id === job.id))
const lj = (await lget(`job/${job.id}`)).body
check('local : conversation complète de Claude', lj.transcript?.some((e) => e.k === 'tool') && lj.transcript?.length > 1)
check('local : étapes avec libellés', lj.steps?.length === 8 && !!lj.steps[0].label)
check('local : tâches', lj.todo?.length > 0)
check('local : question visible', lj.questions?.length === 0 || lj.questions?.[0]?.text.includes('Bouton'))
const lm = await lpost('message', { jobId: job.id, text: 'Message depuis la fenêtre', mode: 'next' }); check('local : message envoyé à Claude', lm.ok === true)
await until('local : message dans la conversation', async () => (await lget(`job/${job.id}`)).body.transcript?.some((e) => e.k === 'user' && /fenêtre/.test(e.text)))
check('local : action inconnue refusée', (await lpost('control', { jobId: job.id, action: 'format' })).error === 'action')
check('local : projet inconnu refusé', (await lpost('message', { jobId: '00000000-0000-4000-8000-000000000000', text: 'x' })).error === 'job')
console.log('4a2. aperçu en direct')
const devTok = JSON.parse(readFileSync(path.join(home, 'config.json'), 'utf8')).deviceToken
const bapi = (b) => fetch(`${BASE}/api/studio/bridge/preview`, { method: 'POST', headers: { authorization: `Bearer ${devTok}`, 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) }))
const badSlot = await bapi({ jobId: job.id, slot: '../x' }); check('aperçu : zone inconnue refusée', badSlot.status === 400)
const pv = await bapi({ jobId: job.id, slot: 'site' }); check('aperçu : lien d\'envoi', !!pv.upload?.url && /preview\/site-/.test(pv.path), JSON.stringify(pv).slice(0, 160))
const pvPut = await fetch(pv.upload.url, { method: 'PUT', body: 'JPEGDATA' }); check('aperçu : image envoyée', pvPut.ok)
const evil = await bapi({ jobId: job.id, slot: 'site', path: 'autre-utilisateur/x/preview/site-0.jpg' }); check('aperçu : chemin étranger refusé', evil.status === 400)
const pvDone = await bapi({ jobId: job.id, slot: 'site', path: pv.path, label: 'http://localhost:3000' }); check('aperçu : confirmé', pvDone.status === 200)
const seen = await api('GET', `jobs/${job.id}/preview`); check('aperçu : lisible par Flow', !!seen.slots?.site?.url)
if (seen.slots?.site?.url) { const img = await fetch(seen.slots.site.url); check('aperçu : image téléchargeable', img.ok && (await img.text()) === 'JPEGDATA') }
console.log('4b. pause / reprise')
await until('en cours', async () => ['running'].includes((await api('GET', `jobs/${job.id}`)).job?.status))
await sleep(1500)
const p = await api('POST', `jobs/${job.id}/control`, { action: 'pause' }); check('pause demandée', p.status === 200)
await sleep(2500)
const step1 = (await api('GET', `jobs/${job.id}`)).job
await sleep(2500)
const step2 = (await api('GET', `jobs/${job.id}`)).job
check('en pause', step2.status === 'paused')
check('rien n\'avance pendant la pause', step1.step === step2.step && step1.progress === step2.progress, `${step1.step}/${step2.step}`)
const r = await api('POST', `jobs/${job.id}/control`, { action: 'resume' }); check('reprise demandée', r.status === 200)

const m1 = await api('POST', `jobs/${job.id}/message`, { text: 'Fais le fond plus clair', mode: 'next' }); check('message envoyé', m1.status === 201)
const delivered = await until('message remis', async () => { const j = (await api('GET', `jobs/${job.id}`)).job; return j?.events.find((e) => e.kind === 'message' && e.data?.state && e.data.state !== 'sent') })
check('état du message mis à jour', ['delivered', 'applied'].includes(delivered.data.state))

console.log('6. livraison')
const done = await until('terminé', async () => { const j = (await api('GET', `jobs/${job.id}`)).job; return j?.status === 'done' ? j : null }, 60000)
await api('GET', `jobs/${job.id}/preview`)
const pollW = await fetch(`${BASE}/api/studio/bridge/poll`, { method: 'POST', headers: { authorization: `Bearer ${devTok}`, 'content-type': 'application/json' }, body: JSON.stringify({ busyJob: job.id, version: '1.1.0' }) }).then((r) => r.json()); check('le pont sait que Flow regarde', pollW.watch === true)
const out = done.assets.find((x) => x.direction === 'out' && x.name === 'final.mp4')
check('rendu récupéré', !!out?.uploaded && !!out.url)
if (out?.url) { const f = await fetch(out.url); check('rendu téléchargeable', f.ok && (await f.arrayBuffer()).byteLength === 300000) }
const lib = await api('GET', 'library'); check('bibliothèque : envoyé + rendu', lib.items.some((i) => i.kind === 'render') && lib.items.some((i) => i.kind === 'sent'))
check('fichier d\'entrée copié sur le Mac', existsSync(path.join(work, 'motion', job.id, 'entrees', 'ref.txt')))

console.log('7. message après la fin (reprise de la session)')
const att = await api('POST', `jobs/${job.id}/assets`, { name: 'capture.png', size: 4, mime: 'image/png', kind: 'image' })
await fetch(att.upload.url, { method: 'PUT', body: 'PNG!' }); await api('PATCH', `jobs/${job.id}/assets`, { assetId: att.asset.id })
const m2 = await api('POST', `jobs/${job.id}/message`, { text: 'Ajoute un logo plus grand (voir capture)', mode: 'next', assetIds: [att.asset.id] }); check('message après fin + image accepté', m2.status === 201)
await until('image jointe copiée sur le Mac', () => { try { return require_ls(path.join(work, 'motion', job.id, 'entrees')).some((f) => f.startsWith('msg-') && f.endsWith('capture.png')) } catch { return false } })
await until('relancé', async () => { const j = (await api('GET', `jobs/${job.id}`)).job; return j?.events.some((e) => /Claude reprend la session/.test(e.title)) })
const again2 = await until('de nouveau terminé', async () => { const j = (await api('GET', `jobs/${job.id}`)).job; return j?.status === 'done' && j.events.filter((e) => e.kind === 'result').length >= 2 ? j : null }, 60000)
check('deuxième livraison', !!again2)

console.log('7b. « ne pas me poser de questions »')
const nq = await api('POST', 'jobs', { kind: 'site', title: 'Sans question', spec: { noQuestions: true }, prompt: prompt.replace('motion design', 'Site vitrine') + '\nMission : Site vitrine' })
await api('POST', `jobs/${nq.job.id}/submit`)
const nqDone = await until('site sans question terminé', async () => { const j = (await api('GET', `jobs/${nq.job.id}`)).job; return j?.status === 'done' ? j : null }, 90000)
check('aucune question posée', nqDone.questions.length === 0)
console.log('8. site + annulation')
const s = await api('POST', 'jobs', { kind: 'site', title: 'Test site', spec: {}, prompt: prompt.replace('motion design', 'Site vitrine') + '\nMission : Site vitrine' })
await api('POST', `jobs/${s.job.id}/submit`)
await until('site démarré', async () => ['running', 'needs_answer'].includes((await api('GET', `jobs/${s.job.id}`)).job?.status))
const c1 = await api('POST', `jobs/${s.job.id}/control`, { action: 'cancel' }); check('annulation', c1.status === 200)
await sleep(1500)
check('statut annulé', (await api('GET', `jobs/${s.job.id}`)).job.status === 'cancelled')

console.log('8b. Claude non connecté sur le Mac')
bridge.kill(); await sleep(500)
const bridge2 = spawn('node', [path.join(HERE, '..', 'public', 'studio', 'flow-bridge.mjs'), 'start'], { env: { ...env, FAKE_FAIL: 'login' }, stdio: 'ignore' })
await until('pont relancé', async () => (await api('GET', 'devices')).devices?.[0]?.online)
const f = await api('POST', 'jobs', { kind: 'motion', title: 'Pas connecté', spec: {}, prompt })
await api('POST', `jobs/${f.job.id}/submit`)
const failed = await until('échec explicite', async () => { const j = (await api('GET', `jobs/${f.job.id}`)).job; return j?.status === 'failed' ? j : null })
check('message clair', /pas connecté/.test(failed.error ?? ''), failed.error)
bridge2.kill()

console.log('8c. installation des logiciels depuis Flow')
bridge2.kill(); await sleep(500)
const bridge3 = spawn('node', [path.join(HERE, '..', 'public', 'studio', 'flow-bridge.mjs'), 'start'], { env: { ...env, FLOW_BRIDGE_FAKE: '1', FLOW_FAKE_MISSING: 'effectcraft,remotion,ffmpeg' }, stdio: 'ignore' })
const dev0 = await until('état des logiciels reçu', async () => { const d = (await api('GET', 'devices')).devices?.[0]; return d?.setup?.components?.find((c) => c.id === 'effectcraft')?.state === 'missing' ? d : null })
check('EffectCraft vu comme manquant', dev0.setup.components.find((c) => c.id === 'effectcraft')?.state === 'missing')
check('composants regroupés (motion, ia, outils, site)', ['motion', 'ia', 'outils', 'site'].every((g) => dev0.setup.components.some((c) => c.group === g)))
const sreq = await api('POST', `devices/${dev0.id}/setup`, { action: 'install', component: 'effectcraft', choice: 'effectcraft' }); check('installation demandée depuis Flow', sreq.status === 202, JSON.stringify(sreq))
let sawProgress = false
const dev1 = await until('EffectCraft installé', async () => { const d = (await api('GET', 'devices')).devices?.[0]; if (d?.setup?.installing?.pct > 0) sawProgress = true; return d?.setup?.components.find((c) => c.id === 'effectcraft')?.state === 'ok' ? d : null }, 30000)
check('progression visible pendant l\'installation', sawProgress)
check('moteur mémorisé', dev1.setup.engine === 'effectcraft')
const badAct = await api('POST', `devices/${dev0.id}/setup`, { action: 'format-disk' }); check('action inconnue refusée', badAct.status === 400)
bridge3.kill()

console.log('9b. Mac supprimé dans Flow : la fenêtre repart avec un nouveau code')
const bridge4 = spawn('node', [path.join(HERE, '..', 'public', 'studio', 'flow-bridge.mjs'), 'start'], { env: { ...env, FLOW_BRIDGE_FAKE: '1' }, stdio: 'ignore' })
await until('pont 4 en ligne', async () => (await api('GET', 'devices')).devices?.[0]?.online)
await until('fenêtre du pont 4', async () => { try { return JSON.parse(readFileSync(path.join(home, 'ui.json'), 'utf8')).pid === bridge4.pid } catch { return false } })
const devNow = (await api('GET', 'devices')).devices?.[0]
const rmDev = await fetch(`${BASE}/api/studio/devices?id=${devNow.id}`, { method: 'DELETE', headers: COOKIE }); check('appareil supprimé côté Flow', rmDev.ok)
const uiNow = JSON.parse(readFileSync(path.join(home, 'ui.json'), 'utf8'))
const lstate = async () => (await (await fetch(uiNow.url + 'state')).json())
const unp = await until('la fenêtre voit que le Mac n\'est plus relié et propose un code', async () => { const st = await lstate(); return st.paired === false && /^FLOW-/.test(st.pair?.code ?? '') ? st : null }, 60000)
check('code de liaison fonctionnel proposé', !!unp.pair.code)
const reconf = await api('POST', 'pair/confirm', { code: unp.pair.code }); check('le nouveau code relie le Mac', reconf.status === 200)
await until('le Mac est relié à nouveau', async () => (await lstate()).paired === true)
bridge4.kill()
console.log('9. sécurité')
const noAuth = await fetch(`${BASE}/api/studio/jobs`); check('API refuse sans session', noAuth.status === 401)
const badTok = await fetch(`${BASE}/api/studio/bridge/poll`, { method: 'POST', headers: { authorization: 'Bearer faux' } }); check('pont refuse un faux jeton', badTok.status === 401)
const badFile = await fetch(`${BASE}/api/studio/files?path=../../etc/passwd&exp=${Date.now() + 1000}&sig=x`); check('fichiers : signature obligatoire', badFile.status === 403)

bridge.kill(); conn.kill()
console.log(`\n${ok} réussis, ${bad} échecs`)
process.exit(bad ? 1 : 0)
