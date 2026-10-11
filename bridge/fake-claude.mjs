#!/usr/bin/env node
// Faux Claude Code pour tester le pont sans consommer de tokens : parle le même protocole stream-json.
//   FLOW_BRIDGE_CLAUDE=node  +  claudeArgsPrefix=[ce fichier]
// Comportement : suit les étapes, pose une question, attend la réponse, accepte messages / interruption, livre, puis reste à l'écoute.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { randomBytes } from 'node:crypto'

const dir = process.env.FLOW_JOB_DIR || process.cwd()
const STEP_MS = Number(process.env.FAKE_STEP_MS || 700)
const out = (o) => process.stdout.write(JSON.stringify(o) + '\n')
const session = `fake-${randomBytes(4).toString('hex')}`
const resumed = process.argv.includes('--resume')
const sid = resumed ? process.argv[process.argv.indexOf('--resume') + 1] : session
let kind = 'motion', started = false, aborted = false, working = false, queue = [], stepIdx = 0, askedOnce = false, waitingAnswer = false, delivered = false

const STEPS = { motion: ['receive', 'analyse', 'plan', 'build', 'compare', 'sound', 'render4k', 'verify'], site: ['interview', 'analyse', 'design', 'structure', 'build', 'data', 'deploy', 'qa', 'motion', 'deliver'] }
const say = (text) => out({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } })
const tool = (command) => out({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Bash', input: { command } }] } })
const result = (extra = {}) => out({ type: 'result', subtype: 'success', is_error: false, result: 'ok', session_id: sid, num_turns: 1, ...extra })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

function deliver() {
  mkdirSync(path.join(dir, 'rendu'), { recursive: true })
  if (kind === 'motion') {
    writeFileSync(path.join(dir, 'rendu', 'final.mp4'), randomBytes(300_000))
    writeFileSync(path.join(dir, 'rendu', 'rapport.json'), JSON.stringify({ statut: 'ok', fichier: 'final.mp4' }))
    writeFileSync(path.join(dir, 'rendu', 'rapport.md'), '# Rapport\nRendu 4K vérifié (test).\n')
  } else {
    writeFileSync(path.join(dir, 'LIVRAISON.json'), JSON.stringify({ statut: 'ok', url: 'https://exemple-test.vercel.app' }))
    writeFileSync(path.join(dir, 'LIVRAISON.md'), '# Livraison\nSite en ligne (test).\n')
  }
  delivered = true
}

async function work() {
  working = true; aborted = false
  const steps = STEPS[kind]
  while (stepIdx < steps.length) {
    if (aborted) { working = false; return }
    const step = steps[stepIdx]
    writeFileSync(path.join(dir, 'progress.json'), JSON.stringify({ step, progress: Math.round((stepIdx / steps.length) * 95), detail: `Étape ${step} (test)` }))
    tool(`echo ${step}`)
    if (queue.length) { say(`Message pris en compte : ${queue.splice(0).join(' / ')}`) }
    await wait(STEP_MS)
    if (aborted) { working = false; return }
    if (step === 'build' && !askedOnce && process.env.FAKE_ASK !== '0') {
      askedOnce = true; waitingAnswer = true
      writeFileSync(path.join(dir, 'QUESTION.json'), JSON.stringify({ question: 'Bouton principal : « Commencer » ou « Voir les offres » ?', choices: ['Commencer', 'Voir les offres'] }))
      say('J\'ai une question mais je continue le reste.')
      while (waitingAnswer && !aborted) await wait(200)
      if (aborted) { working = false; return }
    }
    stepIdx++
  }
  deliver(); say('Terminé : livraison écrite.'); working = false
  result()
}

const rl = readline.createInterface({ input: process.stdin })
out({ type: 'system', subtype: 'init', session_id: sid, model: 'fake', cwd: dir })
rl.on('line', (l) => {
  let m; try { m = JSON.parse(l) } catch { return }
  if (m.type === 'control_request' && m.request?.subtype === 'interrupt') { aborted = true; out({ type: 'control_response', response: { subtype: 'success', request_id: m.request_id } }); setTimeout(() => result({ subtype: 'error_during_execution', is_error: true }), 50); return }
  if (m.type !== 'user') return
  const text = (m.message?.content ?? []).map((c) => c.text ?? '').join('')
  if (!started) {
    started = true; if (/site/i.test(process.env.FLOW_JOB_DIR ?? '') || /Mission : (Site vitrine|Boutique|Landing|Autre projet)/.test(text)) kind = 'site'
    if (resumed) { stepIdx = STEPS[kind].length; say(`Message reçu après livraison : ${text.slice(0, 80)}`); deliver(); result(); return }
    void work(); return
  }
  if (/Réponse de l'utilisateur/.test(text)) { waitingAnswer = false; say('Merci pour la réponse.'); return }
  if (!working) { // après livraison (ou après interruption) : on applique le message puis on reprend s'il reste du travail
    say(`Message appliqué : ${text.replace(/\s+/g, ' ').slice(0, 80)}`)
    if (stepIdx < STEPS[kind].length) void work(); else { deliver(); result() }
    return
  }
  queue.push(text.replace(/\s+/g, ' ').slice(0, 80))
})
rl.on('close', () => process.exit(0))
