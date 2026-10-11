'use client'
import { studioApi, uploadFile } from './api'
import type { RefItem } from './types'

/** Crée la demande, envoie les fichiers (vidéos, captures, logos…) vers le stockage, puis la soumet au Mac. */
export async function createAndSubmit(input: { kind: 'motion' | 'site'; title: string; spec: Record<string, unknown>; prompt: string; refs: RefItem[]; workspaceId?: string; onFile?: (name: string, i: number, n: number) => void }) {
  const { job } = await studioApi.createJob({ kind: input.kind, title: input.title, spec: input.spec, prompt: input.prompt, workspaceId: input.workspaceId })
  const files = input.refs.filter((r) => r.file)
  let i = 0
  for (const r of files) { input.onFile?.(r.name, ++i, files.length); await uploadFile(job.id, r.file!, r.kind) }
  await studioApi.submit(job.id)
  return job.id
}
