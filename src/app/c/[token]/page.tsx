'use client'
/**
 * Page du client, ouverte par son lien secret. Aucune navigation ni autre page de Flow : seulement son espace.
 * Jeton « demo… » : la démo de Flow, lue dans ce navigateur (aucun appel au serveur).
 */
import { use, useCallback, useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { putSigned, signedUploadUrl } from '@/lib/clients-upload'
import { Lock } from 'lucide-react'
import { ClientSpace, type SpaceProps } from '@/components/clients/client-space'
import { Logo } from '@/components/ui/logo'
import { LanguageToggle, ThemeToggle } from '@/components/ui/toggles'
import { useI18n } from '@/i18n/provider'
import { getBrowserDemoClient } from '@/lib/demo/runtime'
import { CLIENT_BUCKET, clientFilePath, isDemoToken, nextVersion, titleFromName, type ClientFile, type ClientMessage, type ClientRow, type ClientTodo, type PortalData } from '@/lib/clients'

type Loaded = PortalData | null | undefined

/** Démo : mêmes données que l'espace « demo » de ce navigateur (ce que vous envoyez côté Flow apparaît ici). */
function useDemoPortal(token: string, on: boolean) {
  const db = useMemo(() => (on ? getBrowserDemoClient() as unknown as SupabaseClient : null), [on])
  const [data, setData] = useState<Loaded>(undefined)
  const load = useCallback(async () => {
    if (!db) return
    const { data: c } = await db.from('clients').select('*').eq('access_token', token).is('deleted_at', null).maybeSingle()
    if (!c) { setData(null); return }
    const cl = c as ClientRow
    const [ws, m, f, t] = await Promise.all([
      db.from('workspaces').select('name').eq('id', cl.workspace_id).maybeSingle(),
      db.from('client_messages').select('*').eq('client_id', cl.id).is('deleted_at', null),
      db.from('client_files').select('*').eq('client_id', cl.id).is('deleted_at', null),
      db.from('client_todos').select('*').eq('client_id', cl.id).is('deleted_at', null),
    ])
    setData({
      client: { id: cl.id, name: cl.name, company: cl.company, cadence: cl.cadence, per_period: cl.per_period, color: cl.color, workspace_name: (ws.data as { name?: string } | null)?.name ?? null },
      messages: (m.data ?? []) as ClientMessage[], files: (f.data ?? []) as ClientFile[], todos: (t.data ?? []) as ClientTodo[],
    })
  }, [db, token])
  return { db, data, load }
}

export default function ClientPortal({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const { t } = useI18n()
  const demo = isDemoToken(token)
  const dm = useDemoPortal(token, demo)
  const [real, setReal] = useState<Loaded>(undefined)

  const loadReal = useCallback(async () => {
    const res = await fetch(`/api/portail/${encodeURIComponent(token)}`, { cache: 'no-store' }).catch(() => null)
    if (!res) return
    if (res.ok) setReal(await res.json() as PortalData)
    else if (res.status === 404) setReal(null)
    // autre erreur (réseau, serveur) : on garde ce qui est affiché et on réessaie au prochain tour
  }, [token])
  const load = demo ? dm.load : loadReal

  useEffect(() => {
    void load()
    // le client n'a pas le temps réel : relecture régulière tant que la page est visible
    const id = setInterval(() => { if (document.visibilityState === 'visible') void load() }, 15_000)
    const onVis = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
  }, [load])

  const data = demo ? dm.data : real

  const post = useCallback(async (body: object) => {
    const res = await fetch(`/api/portail/${encodeURIComponent(token)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) throw new Error(String(res.status))
    return res.json() as Promise<Record<string, string>>
  }, [token])

  const actions = useMemo((): Pick<SpaceProps, 'send' | 'upload' | 'urlOf' | 'review'> | null => {
    if (!data) return null
    const c = data.client
    if (demo && dm.db) {
      const db = dm.db
      const base = { workspace_id: null as string | null, client_id: c.id }
      const wsId = async () => base.workspace_id ??= ((await db.from('clients').select('workspace_id').eq('id', c.id).maybeSingle()).data as { workspace_id: string } | null)?.workspace_id ?? null
      const say = async (body: string, file_id: string | null = null) => {
        await db.from('client_messages').insert({ workspace_id: await wsId(), client_id: c.id, author_kind: 'client', author_id: null, author_name: c.name, body, file_id, created_at: new Date().toISOString(), deleted_at: null })
      }
      return {
        send: async (body) => { await say(body); await dm.load() },
        upload: async (file) => {
          const ws = await wsId()
          const path = clientFilePath(ws ?? 'demo', c.id, file.name)
          await db.storage.from(CLIENT_BUCKET).upload(path, file)
          const now = new Date().toISOString()
          const title = titleFromName(file.name)
          await db.from('client_files').insert({ workspace_id: ws, client_id: c.id, title, name: file.name, mime_type: file.type || null, size: file.size, storage_path: path, version: nextVersion(data.files, title), status: 'recu', uploaded_by_kind: 'client', uploaded_by: null, created_at: now, updated_at: now, deleted_at: null })
          await dm.load()
        },
        urlOf: async (f) => f.storage_path.startsWith('/') ? f.storage_path : (await db.storage.from(CLIENT_BUCKET).createSignedUrl(f.storage_path, 3600)).data?.signedUrl ?? null,
        review: async (f, status, note) => {
          await db.from('client_files').update({ status, updated_at: new Date().toISOString() }).eq('id', f.id)
          if (note) await say(note, f.id)
          await dm.load()
        },
      }
    }
    return {
      send: async (body) => { await post({ action: 'message', body }); await loadReal() },
      upload: async (file, _title, _version, onProgress) => {
        const { path, token: upToken } = await post({ action: 'upload-url', name: file.name, size: file.size })
        // envoi direct vers le stockage avec le lien signé : la vidéo ne passe pas par le serveur de Flow
        await putSigned(signedUploadUrl(CLIENT_BUCKET, path, upToken), file, onProgress)
        await post({ action: 'file', path, name: file.name, size: file.size, mime: file.type || null })
        await loadReal()
      },
      urlOf: async (f) => (f as ClientFile & { url?: string | null }).url ?? null,
      review: async (f, status, note) => { await post({ action: 'review', file_id: f.id, status, note }); await loadReal() },
    }
  }, [data, demo, dm, post, loadReal])

  const wsName = data?.client.workspace_name ?? 'Flow'
  return (
    <div className="min-h-dvh px-4 pb-10 pt-5 md:px-6">
      <header className="mx-auto mb-6 flex max-w-6xl items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5"><Logo size={26} /><span className="truncate text-[13px] font-medium text-text-2">{wsName}</span></div>
        <div className="flex shrink-0"><LanguageToggle /><ThemeToggle /></div>
      </header>
      <main className="mx-auto max-w-6xl">
        {data === undefined && <div className="space-y-3"><div className="skeleton h-10 w-60 rounded-lg" /><div className="skeleton h-72 rounded-xl" /></div>}
        {data === null && (
          <div className="mx-auto max-w-md rounded-2xl border border-border bg-surface p-8 text-center">
            <Lock className="mx-auto mb-3 size-6 text-text-3" />
            <h1 className="text-lg font-semibold">{t('cli.portal.invalid')}</h1>
            <p className="mt-1 text-sm text-text-2">{t('cli.portal.invalidHint')}</p>
          </div>
        )}
        {data && actions && (
          <>
            <div className="mb-5">
              <h1 className="text-2xl font-semibold tracking-tight">{t('cli.portal.welcome', { n: data.client.name })}</h1>
              <p className="mt-1 text-sm text-text-2">{t('cli.portal.sub', { w: wsName })}</p>
            </div>
            <ClientSpace viewer="client" clientId={data.client.id} cadence={data.client.cadence} perPeriod={data.client.per_period} workspaceName={wsName} messages={data.messages} files={data.files} todos={data.todos}
              authorName={(m) => m.author_kind === 'client' ? data.client.name : m.author_name ?? wsName} {...actions} />
            <p className="mt-6 flex items-center justify-center gap-1.5 text-[12px] text-text-3"><Lock className="size-3" />{t('cli.portal.private')}</p>
          </>
        )}
      </main>
    </div>
  )
}
