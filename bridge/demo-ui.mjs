#!/usr/bin/env node
// Pont de démonstration (faux Claude) : pour voir la fenêtre Flow Studio avec un projet en cours.
//   STUDIO_STORE=file npm run dev -- -p 3100   puis   node bridge/demo-ui.mjs   (écrit l'adresse de la fenêtre dans $URL_FILE)
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const BASE = process.env.FLOW_SERVER || 'http://localhost:3100', HERE = path.dirname(fileURLToPath(import.meta.url))
const home = mkdtempSync(path.join(tmpdir(), 'fb-demo-')), H = { cookie: 'flow_demo=1', 'content-type': 'application/json' }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const api = async (m, p, b) => (await fetch(`${BASE}/api/studio/${p}`, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined })).json()
const env = { ...process.env, FLOW_SERVER: BASE, FLOW_BRIDGE_HOME: home, FLOW_DEVICE_NAME: 'Mac démo', FLOW_BRIDGE_NO_WINDOWS: '1' }
const conn = spawn('node', [path.join(HERE, '..', 'public/studio/flow-bridge.mjs'), 'connect'], { env }); let t = ''; conn.stdout.on('data', (d) => (t += d))
let code; while (!(code = t.match(/FLOW-[A-Z0-9]{4}-[A-Z0-9]{4}/)?.[0])) await sleep(300)
await api('POST', 'pair/confirm', { code }); while (!existsSync(path.join(home, 'config.json'))) await sleep(300)
const cfg = JSON.parse(readFileSync(path.join(home, 'config.json'), 'utf8')), work = path.join(home, 'work')
Object.assign(cfg, { claudeBin: 'node', claudeArgsPrefix: [path.join(HERE, 'fake-claude.mjs')], motionRoot: path.join(work, 'motion'), sitesRoot: path.join(work, 'sites'), atelier: work })
writeFileSync(path.join(home, 'config.json'), JSON.stringify(cfg))
spawn('node', [path.join(HERE, '..', 'public/studio/flow-bridge.mjs'), 'start'], { env: { ...env, FAKE_STEP_MS: process.env.FAKE_STEP_MS || '4000' }, stdio: 'ignore' })
const { job } = await api('POST', 'jobs', { kind: 'site', title: 'Es Loc — location de véhicules', spec: {}, prompt: 'x'.repeat(80) + '\nMission : Site vitrine' })
await api('POST', `jobs/${job.id}/submit`)
while (!existsSync(path.join(home, 'ui.json'))) await sleep(300)
const dir = path.join(work, 'sites', job.id); while (!existsSync(dir)) await sleep(300)
writeFileSync(path.join(dir, 'preview.json'), JSON.stringify({ site: BASE }))
writeFileSync(process.env.URL_FILE || path.join(home, 'url.txt'), JSON.parse(readFileSync(path.join(home, 'ui.json'), 'utf8')).url)
console.log('prêt', home); await new Promise(() => {})
