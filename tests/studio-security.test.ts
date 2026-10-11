import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

type Svc = typeof import('@/lib/studio/server/service')
let S: Svc
const U = '33333333-3333-4333-8333-333333333333'
const PROMPT = 'p'.repeat(80)

beforeAll(async () => {
  process.env.STUDIO_STORE = 'file'
  process.chdir(mkdtempSync(path.join(tmpdir(), 'studio-sec-')))
  S = await import('@/lib/studio/server/service')
})

describe('sécurité : identifiants et limites', () => {
  it('refuse les identifiants qui ne sont pas des UUID', async () => {
    await expect(S.getJob(U, "x' or '1'='1")).rejects.toMatchObject({ status: 400 })
    await expect(S.controlJob(U, '../../etc', 'cancel')).rejects.toMatchObject({ status: 400 })
    await expect(S.sendMessage(U, 'abc', 'hello', 'next')).rejects.toMatchObject({ status: 400 })
    await expect(S.removeDevice(U, 'nope')).rejects.toMatchObject({ status: 400 })
    await expect(S.requestSetup(U, 'nope', { action: 'rescan' })).rejects.toMatchObject({ status: 400 })
  })
  it('plafonne les demandes en cours et la taille des spécifications', async () => {
    await expect(S.createJob(U, { kind: 'site', title: 'gros', spec: { x: 'y'.repeat(120_000) }, prompt: PROMPT })).rejects.toMatchObject({ status: 413 })
    for (let i = 0; i < 8; i++) await S.createJob(U, { kind: 'site', title: `j${i}`, spec: {}, prompt: PROMPT })
    await expect(S.createJob(U, { kind: 'site', title: 'trop', spec: {}, prompt: PROMPT })).rejects.toMatchObject({ status: 429 })
  })
  it('refuse un lien de livraison qui n\'est pas en https', async () => {
    const p = await S.pairStart({ deviceName: 'Sec' }); await S.pairConfirm(U, p.code)
    const polled = await S.pairPoll(p.pollToken)
    const dev = await S.deviceFromToken((polled as { deviceToken: string }).deviceToken)
    const job = (await S.listJobs(U))[0]
    await expect(S.bridgeAsset(dev, job.id, { name: 'x', link: 'javascript:alert(1)' }, 'http://x')).rejects.toMatchObject({ status: 400 })
    await expect(S.bridgeAsset(dev, job.id, { name: 'x', link: 'http://insecure.test' }, 'http://x')).rejects.toMatchObject({ status: 400 })
    await S.bridgeAsset(dev, job.id, { name: 'ok', link: 'https://ok.test' }, 'http://x')
  })
  it('un appareil ne peut pas agir sur le projet d\'un autre utilisateur', async () => {
    const OTHER = '44444444-4444-4444-8444-444444444444'
    const job = await S.createJob(OTHER, { kind: 'motion', title: 'autre', spec: {}, prompt: PROMPT })
    const p = await S.pairStart({ deviceName: 'Intrus' }); await S.pairConfirm(U, p.code)
    const dev = await S.deviceFromToken(((await S.pairPoll(p.pollToken)) as { deviceToken: string }).deviceToken)
    await expect(S.bridgeEvent(dev, job.id, { type: 'status', status: 'done' })).rejects.toMatchObject({ status: 404 })
    await expect(S.bridgeJob(dev, job.id, 'http://x')).rejects.toMatchObject({ status: 404 })
  })
})

describe('sécurité : installateur et origine', () => {
  it('le mode fichier est refusé en production', async () => {
    const db = await import('@/lib/studio/server/db')
    expect(db.fileModeAllowed()).toBe(true)
    const prev = process.env.NODE_ENV
    ;(process.env as Record<string, string>).NODE_ENV = 'production'
    expect(db.fileModeAllowed()).toBe(false)
    ;(process.env as Record<string, string>).NODE_ENV = prev!
  })
  it('l\'origine est validée (pas d\'en-tête Host piégé)', async () => {
    const { originFromHeaders } = await import('@/lib/studio/server/origin')
    expect(originFromHeaders(new Headers({ host: 'new-flow-dashboard.vercel.app' }))).toBe('https://new-flow-dashboard.vercel.app')
    expect(originFromHeaders(new Headers({ host: 'localhost:3100' }))).toBe('http://localhost:3100')
    for (const bad of ['evil.com/x', 'a b', 'x"; rm -rf ~; "', '']) expect(() => originFromHeaders(new Headers({ host: bad }))).toThrow()
  })
  it('le script force HTTPS et ne contient que l\'origine validée', async () => {
    const { installScript, commandFile } = await import('@/lib/studio/server/installer-script')
    const s = installScript('https://exemple.test')
    expect(s).toContain("--proto '=https' --tlsv1.2")
    expect(s).toContain('ORIGIN="https://exemple.test"')
    expect(commandFile('https://exemple.test')).toContain('bash <(curl')
  })
  it('l\'archive ZIP est valide et garde le droit d\'exécution', async () => {
    const { zipStore, crc32 } = await import('@/lib/studio/server/zip')
    const z = zipStore([{ name: 'a.command', data: Buffer.from('#!/bin/bash\n'), mode: 0o755 }])
    expect(z.readUInt32LE(0)).toBe(0x04034b50)
    const eocd = z.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
    const cdOff = z.readUInt32LE(eocd + 16)
    expect(z.readUInt32LE(cdOff)).toBe(0x02014b50)
    expect((z.readUInt32LE(cdOff + 38) >>> 16) & 0o777).toBe(0o755)
    expect(z.readUInt32LE(14)).toBe(crc32(Buffer.from('#!/bin/bash\n')))
  })
})
