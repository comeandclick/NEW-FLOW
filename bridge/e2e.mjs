#!/usr/bin/env node
// Test de bout en bout du système Studio : serveur Flow (STUDIO_STORE=file) + pont + faux Claude.
//   STUDIO_STORE=file npm run dev -- -p 3100   puis   node bridge/e2e.mjs
import { spawn } from 'node:child_process'
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
check('statut = question', q.status === 'needs_answer')
const a = await api('POST', `jobs/${job.id}/answer`, { questionId: q.questions[0].id, answer: 'Commencer' }); check('réponse acceptée', a.status === 200)
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

console.log('8. site + annulation')
const s = await api('POST', 'jobs', { kind: 'site', title: 'Test site', spec: {}, prompt: prompt.replace('motion design', 'Site vitrine') + '\nMission : Site vitrine' })
await api('POST', `jobs/${s.job.id}/submit`)
await until('site démarré', async () => ['running', 'needs_answer'].includes((await api('GET', `jobs/${s.job.id}`)).job?.status))
const c1 = await api('POST', `jobs/${s.job.id}/control`, { action: 'cancel' }); check('annulation', c1.status === 200)
await sleep(1500)
check('statut annulé', (await api('GET', `jobs/${s.job.id}`)).job.status === 'cancelled')

console.log('9. sécurité')
const noAuth = await fetch(`${BASE}/api/studio/jobs`); check('API refuse sans session', noAuth.status === 401)
const badTok = await fetch(`${BASE}/api/studio/bridge/poll`, { method: 'POST', headers: { authorization: 'Bearer faux' } }); check('pont refuse un faux jeton', badTok.status === 401)
const badFile = await fetch(`${BASE}/api/studio/files?path=../../etc/passwd&exp=${Date.now() + 1000}&sig=x`); check('fichiers : signature obligatoire', badFile.status === 403)

bridge.kill(); conn.kill()
console.log(`\n${ok} réussis, ${bad} échecs`)
process.exit(bad ? 1 : 0)
