// Test d'intégration contre la VRAIE base Supabase (variables de .env.local). Ignoré par défaut.
//   STUDIO_IT=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/studio-supabase.integration.test.ts
// Crée des lignes de test sous un profil existant, puis les supprime (et supprime les fichiers de test du stockage).
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const RUN = process.env.STUDIO_IT === '1'
const d = RUN ? describe : describe.skip

d('studio sur Supabase (réel)', () => {
  type Svc = typeof import('@/lib/studio/server/service')
  let S: Svc, admin: ReturnType<typeof createClient>, userId: string
  const jobs: string[] = [], paths: string[] = []

  beforeAll(async () => {
    delete process.env.STUDIO_STORE
    delete process.env.VAPID_PRIVATE_KEY // pas de notification push pendant le test
    admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } })
    const { data } = await admin.from('profiles').select('id').limit(1)
    userId = (data as { id: string }[])[0].id
    S = await import('@/lib/studio/server/service')
  })
  afterAll(async () => {
    if (!RUN) return
    for (const id of jobs) await admin.from('studio_jobs').delete().eq('id', id)
    await admin.from('studio_devices').delete().eq('name', 'IT Mac')
    await admin.from('studio_pairings').delete().eq('device_name', 'IT Mac')
    await admin.from('notifications').delete().eq('user_id', userId).eq('type', 'studio').like('title', '%IT%')
    if (paths.length) await admin.storage.from('studio').remove(paths)
  })

  it('appairage, demande, fichier, commandes, événements, messages, livraison', async () => {
    const p = await S.pairStart({ deviceName: 'IT Mac', version: '1.0.0' })
    const dev = await S.pairConfirm(userId, p.code)
    const polled = await S.pairPoll(p.pollToken)
    expect(polled.status).toBe('paired')
    const row = await S.deviceFromToken((polled as { deviceToken: string }).deviceToken)
    expect(row.id).toBe(dev.id)

    const job = await S.createJob(userId, { kind: 'motion', title: 'IT motion', spec: { a: 1 }, prompt: 'p'.repeat(80) + ' {{ID}}' })
    jobs.push(job.id)
    // envoi d'un fichier par lien signé (FormData, comme le navigateur et le pont)
    const { asset, upload } = await S.registerAsset(userId, job.id, { name: 'ref it.txt', size: 5, mime: 'text/plain', kind: 'file' }, 'http://x')
    expect(upload.form).toBe(true)
    const fd = new FormData(); fd.append('cacheControl', '3600'); fd.append('', new Blob(['hello']))
    const up = await fetch(upload.url, { method: upload.method, headers: upload.headers, body: fd })
    expect(up.ok, await up.clone().text()).toBe(true)
    paths.push((asset as { storage_path: string }).storage_path)
    await S.assetUploaded(userId, asset.id as string)

    const sub = await S.submitJob(userId, job.id)
    expect(sub.status).toBe('queued')
    const detail = await S.getJob(userId, job.id, 'http://x')
    const a = detail.assets.find((x) => x.name.startsWith('ref'))!
    expect(await (await fetch(a.url!)).text()).toBe('hello') // lien de téléchargement signé

    const poll = await S.bridgePoll(row, { version: '1.0.0', claudeOk: true })
    expect(poll.commands.map((c) => c.type)).toContain('start')
    const bj = await S.bridgeJob(row, job.id, 'http://x')
    expect(bj.inputs[0].url).toBeTruthy(); expect(bj.prompt).toContain(job.id)

    await S.bridgeEvent(row, job.id, { type: 'status', status: 'running', step: 'analyse', progress: 12 })
    await S.bridgeEvent(row, job.id, { type: 'question', text: 'IT question ?', choices: ['A', 'B'] })
    let g = await S.getJob(userId, job.id)
    expect(g.status).toBe('needs_answer'); expect(g.questions[0].choices).toEqual(['A', 'B'])
    await S.answerQuestion(userId, job.id, g.questions[0].id, 'A')
    expect((await S.getJob(userId, job.id)).status).toBe('running')
    expect((await S.controlJob(userId, job.id, 'pause')).status).toBe('paused')
    expect((await S.controlJob(userId, job.id, 'resume')).status).toBe('running')
    const m = await S.sendMessage(userId, job.id, 'IT message', 'now')
    const cmds = (await S.bridgePoll(row, {})).commands.map((c) => c.type)
    expect(cmds).toEqual(expect.arrayContaining(['answer', 'pause', 'resume', 'message']))
    await S.bridgeEvent(row, job.id, { type: 'msgstate', eventId: m.eventId, state: 'applied' })

    const out = await S.bridgeAsset(row, job.id, { name: 'final it.mp4', size: 3, mime: 'video/mp4', kind: 'render' }, 'http://x')
    const fd2 = new FormData(); fd2.append('cacheControl', '3600'); fd2.append('', new Blob(['mp4']))
    expect((await fetch(out.upload!.url, { method: out.upload!.method, headers: out.upload!.headers, body: fd2 })).ok).toBe(true)
    await S.bridgeAssetDone(row, out.id)
    const { data: rec } = await admin.from('studio_assets').select('storage_path').eq('id', out.id).single()
    paths.push((rec as { storage_path: string }).storage_path)
    await S.bridgeEvent(row, job.id, { type: 'delivered', deliver: { files: [{ name: 'final it.mp4' }] }, summary: 'IT ok' })

    g = await S.getJob(userId, job.id, 'http://x')
    expect(g.status).toBe('done'); expect(g.progress).toBe(100)
    expect(g.events.find((e) => e.id === m.eventId)?.data?.state).toBe('applied')
    const lib = await S.library(userId, 'http://x')
    expect(lib.some((i) => i.kind === 'render' && i.name.startsWith('final'))).toBe(true)
    expect(lib.some((i) => i.kind === 'sent' && i.name.startsWith('ref'))).toBe(true)

    // reprise après la fin
    await S.sendMessage(userId, job.id, 'IT retouche', 'next')
    expect((await S.getJob(userId, job.id)).status).toBe('queued')
  }, 90_000)

  it('isolation entre utilisateurs sur la vraie base', async () => {
    const { data } = await admin.from('profiles').select('id').limit(2)
    const rows = (data ?? []) as { id: string }[]
    if (rows.length < 2) return
    const other = rows.find((x) => x.id !== userId)!.id
    const job = await S.createJob(userId, { kind: 'site', title: 'IT privé', spec: {}, prompt: 'p'.repeat(80) })
    jobs.push(job.id)
    await expect(S.getJob(other, job.id)).rejects.toMatchObject({ status: 404 })
  })
})
