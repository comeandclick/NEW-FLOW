'use client'
/** Client de l'API Studio (vrai système). Les adresses sont relatives : le même code marche sur n'importe quel domaine. */
import { useCallback, useEffect, useRef, useState } from 'react'

export type Mode = 'loading' | 'live' | 'demo' | 'setup' | 'anon'
export type LiveDevice = { id: string; name: string; os: string; pairedAt: string; lastSeen: string; online: boolean; busyJob: string | null; version: string | null; claudeOk: boolean | null }
export type LiveEvent = { id: number; at: string; level: 'info' | 'success' | 'warning' | 'error' | 'question'; kind: string; title: string; body: string | null; data: { from?: string; mode?: string; state?: string; files?: { name: string; kind: string }[]; step?: string; progress?: number; questionId?: string } | null }
export type LiveQuestion = { id: string; text: string; choices: string[] | null; askedAt: string; answer: string | null; answeredAt: string | null }
export type LiveAsset = { id: string; direction: 'in' | 'out'; kind: string; name: string; size: number | null; mime: string | null; uploaded: boolean; createdAt: string; link: string | null; url: string | null }
export type LiveStatus = 'draft' | 'queued' | 'starting' | 'running' | 'paused' | 'needs_answer' | 'done' | 'failed' | 'cancelled'
export type LiveJob = {
  id: string; kind: 'motion' | 'site'; title: string; spec: Record<string, unknown>; status: LiveStatus; step: string | null; progress: number; error: string | null
  sessionId: string | null; deliver: { url?: string; files?: { name: string; size?: number }[] } | null
  createdAt: string; startedAt: string | null; finishedAt: string | null; updatedAt: string; device: LiveDevice | null
}
export type LiveJobDetail = LiveJob & { events: LiveEvent[]; questions: LiveQuestion[]; assets: LiveAsset[] }
export type LibraryRow = { id: string; kind: 'sent' | 'render' | 'site'; name: string; size: number | null; mime: string | null; jobId: string | null; jobTitle: string | null; at: string; url: string | null }

export class ApiError extends Error { constructor(public status: number, public code: string) { super(code) } }
async function sf<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/studio/${path}`, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) }, cache: 'no-store' })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, j.error ?? 'error')
  return j as T
}
const post = <T,>(p: string, b?: unknown) => sf<T>(p, { method: 'POST', body: b === undefined ? undefined : JSON.stringify(b) })

export const studioApi = {
  status: () => sf<{ mode: Mode; store: string; ready: boolean; reason: string | null }>('status'),
  jobs: () => sf<{ jobs: LiveJob[] }>('jobs'),
  job: (id: string) => sf<{ job: LiveJobDetail }>(`jobs/${id}`),
  createJob: (b: { kind: 'motion' | 'site'; title: string; spec: Record<string, unknown>; prompt: string; workspaceId?: string }) => post<{ job: { id: string } }>('jobs', b),
  registerAsset: (jobId: string, a: { name: string; size?: number; mime?: string; kind?: string }) => post<{ asset: { id: string }; upload: { url: string; method: string; headers?: Record<string, string>; form?: boolean } }>(`jobs/${jobId}/assets`, a),
  assetUploaded: (jobId: string, assetId: string) => sf<{ ok: true }>(`jobs/${jobId}/assets`, { method: 'PATCH', body: JSON.stringify({ assetId }) }),
  submit: (id: string) => post<{ job: LiveJobDetail }>(`jobs/${id}/submit`),
  control: (id: string, action: 'pause' | 'resume' | 'cancel' | 'retry') => post<{ job: LiveJobDetail }>(`jobs/${id}/control`, { action }),
  message: (id: string, b: { text: string; mode: 'now' | 'next' | 'after'; assetIds?: string[] }) => post<{ eventId: number }>(`jobs/${id}/message`, b),
  answer: (id: string, questionId: string, answer: string) => post<{ ok: true }>(`jobs/${id}/answer`, { questionId, answer }),
  remove: (id: string) => sf<{ ok: true }>(`jobs/${id}`, { method: 'DELETE' }),
  devices: () => sf<{ devices: LiveDevice[] }>('devices'),
  removeDevice: (id: string) => sf<{ ok: true }>(`devices?id=${id}`, { method: 'DELETE' }),
  confirm: (code: string) => post<{ device: LiveDevice }>('pair/confirm', { code }),
  library: () => sf<{ items: LibraryRow[] }>('library'),
}

/** Envoie un fichier vers le stockage (lien d'envoi direct) puis le déclare. Renvoie l'identifiant du fichier. */
export async function uploadFile(jobId: string, file: File, kind = 'file', onProgress?: (done: boolean) => void): Promise<string> {
  const { asset, upload } = await studioApi.registerAsset(jobId, { name: file.name, size: file.size, mime: file.type || undefined, kind })
  const headers = { ...(upload.headers ?? {}) }
  let body: BodyInit = file
  if (upload.form) { const f = new FormData(); f.append('cacheControl', '3600'); f.append('', file); body = f } else if (file.type) headers['content-type'] = file.type
  const res = await fetch(upload.url, { method: upload.method, headers, body })
  if (!res.ok) throw new ApiError(res.status, 'upload')
  await studioApi.assetUploaded(jobId, asset.id)
  onProgress?.(true)
  return asset.id
}

/* ───────── Hooks de lecture (sondage régulier) ───────── */
export function usePoll<T>(fn: () => Promise<T>, ms: number, enabled = true): { data: T | null; error: ApiError | null; refresh: () => Promise<void> } {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const fnRef = useRef(fn); fnRef.current = fn // eslint-disable-line react-hooks/refs
  const refresh = useCallback(async () => {
    try { setData(await fnRef.current()); setError(null) } catch (e) { setError(e instanceof ApiError ? e : new ApiError(0, 'network')) }
  }, [])
  useEffect(() => {
    if (!enabled) return
    void refresh()
    const tick = () => { if (document.visibilityState === 'visible') void refresh() }
    const id = setInterval(tick, ms)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick) }
  }, [enabled, ms, refresh])
  return { data, error, refresh }
}

export function useStudioMode() {
  const [state, setState] = useState<{ mode: Mode; reason: string | null; store: string | null }>({ mode: 'loading', reason: null, store: null })
  useEffect(() => {
    studioApi.status().then((s) => { setState({ mode: s.mode, reason: s.reason, store: s.store }); if (s.mode === 'live') { try { localStorage.setItem('flow_studio_used', '1') } catch {} } }).catch(() => setState({ mode: 'demo', reason: null, store: null }))
  }, [])
  return state
}
