import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

type Svc = typeof import('@/lib/studio/server/service')
let S: Svc
const U1 = '11111111-1111-4111-8111-111111111111'
const U2 = '22222222-2222-4222-8222-222222222222'
const PROMPT = 'p'.repeat(80)

beforeAll(async () => {
  process.env.STUDIO_STORE = 'file'
  process.chdir(mkdtempSync(path.join(tmpdir(), 'studio-svc-')))
  S = await import('@/lib/studio/server/service')
})

async function pairDevice(userId: string, name = 'Mac') {
  const p = await S.pairStart({ deviceName: name, version: '1.0.0' })
  const dev = await S.pairConfirm(userId, p.code)
  const polled = await S.pairPoll(p.pollToken)
  if (polled.status !== 'paired') throw new Error('not paired')
  const row = await S.deviceFromToken(polled.deviceToken)
  return { dev, row, token: polled.deviceToken, pair: p }
}

describe('appairage', () => {
  it('code à usage unique, jeton remis une seule fois', async () => {
    const p = await S.pairStart({ deviceName: 'Mac A' })
    expect(p.code).toMatch(/^FLOW-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
    expect((await S.pairPoll(p.pollToken)).status).toBe('pending')
    const d = await S.pairConfirm(U1, p.code.toLowerCase().replace('-', ' '))
    expect(d.name).toBe('Mac A')
    const first = await S.pairPoll(p.pollToken)
    expect(first.status).toBe('paired')
    expect((await S.pairPoll(p.pollToken)).status).toBe('expired') // le jeton n'est remis qu'une fois
    await expect(S.pairConfirm(U1, p.code)).rejects.toMatchObject({ status: 404 })
  })
  it('refuse un code mal formé ou inconnu', async () => {
    await expect(S.pairConfirm(U1, 'abc')).rejects.toMatchObject({ status: 400 })
    await expect(S.pairConfirm(U1, 'FLOW-AAAA-BBBB')).rejects.toMatchObject({ status: 404 })
  })
  it('le jeton d\'appareil est vérifié', async () => {
    await expect(S.deviceFromToken('faux')).rejects.toMatchObject({ status: 401 })
    await expect(S.deviceFromToken(null)).rejects.toMatchObject({ status: 401 })
  })
})

describe('demandes', () => {
  it('une demande sans Mac attend, puis part dès qu\'un Mac est relié', async () => {
    const job = await S.createJob(U2, { kind: 'motion', title: 'T', spec: {}, prompt: PROMPT + ' {{ID}}' })
    expect(job.prompt).toContain(job.id) // {{ID}} remplacé
    const sub = await S.submitJob(U2, job.id)
    expect(sub.status).toBe('queued'); expect(sub.device).toBeNull()
    const { row } = await pairDevice(U2, 'Mac U2')
    const poll = await S.bridgePoll(row, { version: '1.0.0', claudeOk: true })
    expect(poll.commands.map((c) => c.type)).toEqual(['start'])
    expect((await S.bridgePoll(row, {})).commands).toEqual([]) // remise une seule fois
    expect((await S.listDevices(U2))[0].claudeOk).toBe(true)
  })

  it('isolation : un autre utilisateur ne voit ni ne pilote la demande', async () => {
    const job = await S.createJob(U1, { kind: 'site', title: 'Privé', spec: {}, prompt: PROMPT })
    await expect(S.getJob(U2, job.id)).rejects.toMatchObject({ status: 404 })
    await expect(S.controlJob(U2, job.id, 'cancel')).rejects.toMatchObject({ status: 404 })
    await expect(S.sendMessage(U2, job.id, 'hello', 'next')).rejects.toMatchObject({ status: 404 })
    expect((await S.listJobs(U2)).some((j) => j.id === job.id)).toBe(false)
  })

  it('pause, reprise, annulation, relance : transitions valides seulement', async () => {
    const { row } = await pairDevice(U1, 'Mac U1')
    const job = await S.createJob(U1, { kind: 'motion', title: 'Ctl', spec: {}, prompt: PROMPT })
    await S.submitJob(U1, job.id)
    await expect(S.controlJob(U1, job.id, 'pause')).rejects.toMatchObject({ status: 409 }) // pas démarré
    await S.bridgeEvent(row, job.id, { type: 'status', status: 'running' })
    expect((await S.controlJob(U1, job.id, 'pause')).status).toBe('paused')
    await expect(S.controlJob(U1, job.id, 'pause')).rejects.toMatchObject({ status: 409 })
    expect((await S.controlJob(U1, job.id, 'resume')).status).toBe('running')
    expect((await S.controlJob(U1, job.id, 'cancel')).status).toBe('cancelled')
    await S.bridgeEvent(row, job.id, { type: 'status', status: 'running' }) // état en retard : ne ressuscite pas l'annulation
    expect((await S.getJob(U1, job.id)).status).toBe('cancelled')
    expect((await S.controlJob(U1, job.id, 'retry')).status).toBe('queued')
    const cmds = (await S.bridgePoll(row, {})).commands.map((c) => c.type)
    expect(cmds).toEqual(expect.arrayContaining(['pause', 'resume', 'cancel', 'start']))
  })

  it('questions : la réponse reprend le travail et part vers le Mac', async () => {
    const { row } = await pairDevice(U1, 'Mac Q')
    const job = await S.createJob(U1, { kind: 'site', title: 'Q', spec: {}, prompt: PROMPT })
    await S.submitJob(U1, job.id)
    await S.bridgeEvent(row, job.id, { type: 'status', status: 'running' })
    await S.bridgeEvent(row, job.id, { type: 'question', text: 'Quel bouton ?', choices: ['A', 'B'] })
    let d = await S.getJob(U1, job.id)
    expect(d.status).toBe('needs_answer'); expect(d.questions[0].choices).toEqual(['A', 'B'])
    await S.bridgePoll(row, {}) // vide la file
    await S.answerQuestion(U1, job.id, d.questions[0].id, 'A')
    await expect(S.answerQuestion(U1, job.id, d.questions[0].id, 'B')).rejects.toMatchObject({ status: 409 })
    d = await S.getJob(U1, job.id)
    expect(d.status).toBe('running')
    expect((await S.bridgePoll(row, {})).commands.map((c) => c.type)).toContain('answer')
  })

  it('messages : états, fichiers joints, reprise après la fin', async () => {
    const { row } = await pairDevice(U1, 'Mac M')
    const job = await S.createJob(U1, { kind: 'motion', title: 'Msg', spec: {}, prompt: PROMPT })
    const { asset } = await S.registerAsset(U1, job.id, { name: 'logo.png', size: 3, mime: 'image/png', kind: 'image' }, 'http://x')
    await S.assetUploaded(U1, asset.id)
    await S.submitJob(U1, job.id)
    await S.bridgeEvent(row, job.id, { type: 'status', status: 'running' })
    await S.bridgePoll(row, {})
    const m = await S.sendMessage(U1, job.id, 'Agrandis le logo', 'now', [asset.id], 'http://x')
    const cmd = (await S.bridgePoll(row, {})).commands.find((c) => c.type === 'message')!
    expect(cmd.payload).toMatchObject({ text: 'Agrandis le logo', mode: 'now', eventId: m.eventId })
    expect((cmd.payload as { files: { name: string }[] }).files[0].name).toBe('logo.png')
    await S.bridgeEvent(row, job.id, { type: 'msgstate', eventId: m.eventId, state: 'applied' })
    expect((await S.getJob(U1, job.id)).events.find((e) => e.id === m.eventId)?.data?.state).toBe('applied')
    await S.bridgeEvent(row, job.id, { type: 'delivered', deliver: { files: [] } })
    expect((await S.getJob(U1, job.id)).status).toBe('done')
    await S.sendMessage(U1, job.id, 'Encore une retouche', 'next')
    expect((await S.getJob(U1, job.id)).status).toBe('queued') // le travail redémarre sur la même session
    await expect(S.sendMessage(U1, job.id, '   ', 'next')).rejects.toMatchObject({ status: 400 })
  })

  it('bibliothèque : fichiers envoyés, rendus et sites', async () => {
    const { row } = await pairDevice(U2, 'Mac L')
    const job = await S.createJob(U2, { kind: 'site', title: 'Site L', spec: {}, prompt: PROMPT })
    await S.submitJob(U2, job.id)
    await S.bridgeAsset(row, job.id, { name: 'Site L', kind: 'site', link: 'https://exemple.test' }, 'http://x')
    await S.bridgeEvent(row, job.id, { type: 'delivered', deliver: { url: 'https://exemple.test' } })
    const lib = await S.library(U2, 'http://x')
    expect(lib.some((i) => i.kind === 'site' && i.url === 'https://exemple.test')).toBe(true)
    expect((await S.library(U1, 'http://x')).some((i) => i.jobTitle === 'Site L')).toBe(false)
  })
})

describe('logiciels du Mac', () => {
  it('le pont envoie son état, Flow demande une installation, le pont la reçoit', async () => {
    const { dev, row } = await pairDevice(U1, 'Mac setup')
    await S.bridgeSetup(row, { components: [{ id: 'effectcraft', name: 'EffectCraft', group: 'motion', state: 'missing' }], installing: null, engine: null })
    const listed = (await S.listDevices(U1)).find((d) => d.id === dev.id)!
    expect(listed.setup?.components[0].state).toBe('missing')
    await S.bridgePoll(row, {}) // vide la file
    await S.requestSetup(U1, dev.id, { action: 'install', component: 'effectcraft', choice: 'effectcraft' })
    const cmd = (await S.bridgePoll(row, {})).commands.find((c) => c.type === 'setup')!
    expect(cmd.jobId).toBeNull()
    expect(cmd.payload).toMatchObject({ action: 'install', component: 'effectcraft' })
  })
  it('refuse une action inconnue et un autre utilisateur', async () => {
    const { dev } = await pairDevice(U1, 'Mac setup 2')
    await expect(S.requestSetup(U1, dev.id, { action: 'format' as never })).rejects.toMatchObject({ status: 400 })
    await expect(S.requestSetup(U2, dev.id, { action: 'rescan' })).rejects.toMatchObject({ status: 404 })
  })
})

describe('tâches et aperçus en direct', () => {
  it('la liste des tâches est unique (mise à jour sur place) et absente du fil', async () => {
    const { row } = await pairDevice(U1, 'Mac Todo')
    const job = await S.createJob(U1, { kind: 'site', title: 'Todo', spec: {}, prompt: PROMPT })
    await S.submitJob(U1, job.id)
    await S.bridgeEvent(row, job.id, { type: 'todo', items: [{ text: 'Design', state: 'doing' }, { text: 'Build', state: 'todo' }] })
    await S.bridgeEvent(row, job.id, { type: 'todo', items: [{ text: 'Design', state: 'done' }, { text: 'Build', state: 'doing' }, { text: '', state: 'todo' }, { text: 'x', state: 'weird' as never }] })
    const d = await S.getJob(U1, job.id)
    expect(d.todo.map((t) => `${t.text}:${t.state}`)).toEqual(['Design:done', 'Build:doing', 'x:todo']) // vide retiré, état inconnu = à faire
    expect(d.events.some((e) => e.kind === 'todo')).toBe(false)
  })
  it('aperçu : chemin limité au projet, lecture par le propriétaire seulement, « watch » après lecture', async () => {
    const { row } = await pairDevice(U1, 'Mac Prev')
    const job = await S.createJob(U1, { kind: 'site', title: 'Prev', spec: {}, prompt: PROMPT })
    await S.submitJob(U1, job.id)
    await expect(S.bridgePreview(row, job.id, '../x', 'http://x')).rejects.toMatchObject({ status: 400 })
    const up = await S.bridgePreview(row, job.id, 'site', 'http://x')
    expect(up.path).toMatch(new RegExp(`^${row.user_id}/${job.id}/preview/site-\\d\\.jpg$`))
    await expect(S.bridgePreviewDone(row, job.id, 'site', `${U2}/${job.id}/preview/site-1.jpg`, {})).rejects.toMatchObject({ status: 400 })
    await S.bridgePreviewDone(row, job.id, 'site', up.path, { label: 'http://localhost:3000' })
    await expect(S.getPreview(U2, job.id, 'http://x')).rejects.toMatchObject({ status: 404 })
    expect(await S.isWatched(job.id)).toBe(false)
    const seen = await S.getPreview(U1, job.id, 'http://x')
    expect(seen.slots.site.label).toBe('http://localhost:3000')
    expect(await S.isWatched(job.id)).toBe(true)
    expect((await S.bridgePoll(row, { busyJob: job.id })).watch).toBe(true)
  })
})
