'use client'
import { use, useCallback, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ExternalLink, Link2, MoreHorizontal, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Avatar, EmptyState } from '@/components/ui/misc'
import { Dialog, Menu, MenuItem } from '@/components/ui/overlay'
import { ClientSpace } from '@/components/clients/client-space'
import { EtatClient } from '@/components/clients/etat-client'
import { ClientFormDialog, cadenceLabel, type ClientFields } from '@/components/clients/client-form'
import { useLive } from '@/lib/hooks/use-live'
import { useSession } from '@/lib/hooks/use-session'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { getDb } from '@/lib/supabase/client'
import { isDemoBrowser } from '@/lib/demo/runtime'
import { putSigned } from '@/lib/clients-upload'
import { useI18n } from '@/i18n/provider'
import { CLIENT_BUCKET, clientFilePath, newClientToken, type ClientFile, type ClientMessage, type ClientRow, type ClientTodo } from '@/lib/clients'

export default function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { t } = useI18n()
  const router = useRouter()
  const { ws, canWrite, nameOf, me, log } = useWorkspace()
  const { userId } = useSession()
  const clientQ = useLive<ClientRow>('clients', { eq: { id, workspace_id: ws.id }, is: { deleted_at: null } })
  const messages = useLive<ClientMessage>('client_messages', { eq: { client_id: id }, is: { deleted_at: null }, order: ['created_at', true], channelFilter: `client_id=eq.${id}` })
  const files = useLive<ClientFile>('client_files', { eq: { client_id: id }, is: { deleted_at: null }, order: ['created_at', false], channelFilter: `client_id=eq.${id}` })
  const todos = useLive<ClientTodo>('client_todos', { eq: { client_id: id }, is: { deleted_at: null }, order: ['position', true], channelFilter: `client_id=eq.${id}` })
  const client = clientQ.data[0]
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState<'rotate' | 'delete' | null>(null)

  const link = (token: string) => `${window.location.origin}/c/${token}`
  async function copy(token: string, msg = t('cli.linkCopied')) {
    try { await navigator.clipboard.writeText(link(token)); toast.success(msg) } catch { toast.message(link(token)) }
  }

  const authorName = useCallback((m: ClientMessage) => m.author_kind === 'client' ? (client?.name ?? m.author_name ?? '') : (m.author_id ? nameOf(m.author_id) : m.author_name ?? ''), [client?.name, nameOf])
  const urlOf = useCallback(async (f: ClientFile) => {
    // vidéos de la démo : fichiers publics du site
    if (f.storage_path.startsWith('/')) return f.storage_path
    const { data } = await getDb().storage.from(CLIENT_BUCKET).createSignedUrl(f.storage_path, 3600)
    return data?.signedUrl ?? null
  }, [])

  if (!client) {
    return clientQ.loading
      ? <div className="mx-auto max-w-6xl p-4 md:p-6"><div className="skeleton h-12 w-64 rounded-lg" /></div>
      : <div className="mx-auto max-w-6xl p-4 md:p-6"><EmptyState title={t('cli.notFound')} action={<Link href={`/app/${ws.slug}/clients`}><Button size="sm">{t('cli.back')}</Button></Link>} /></div>
  }

  const base = { workspace_id: ws.id, client_id: client.id }
  async function send(body: string, fileId: string | null = null) {
    const { error } = await getDb().from('client_messages').insert({ ...base, author_kind: 'team', author_id: userId, author_name: me?.full_name ?? null, body, file_id: fileId, created_at: new Date().toISOString(), deleted_at: null })
    if (error) throw error
    void messages.refresh()
  }
  async function upload(file: File, title: string, version: number, onProgress?: (r: number) => void) {
    const path = clientFilePath(ws.id, client.id, file.name)
    if (isDemoBrowser()) {
      const { error: up } = await getDb().storage.from(CLIENT_BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false })
      if (up) throw up
      onProgress?.(1)
    } else {
      // lien d'envoi signé + envoi direct avec la progression (vidéos lourdes)
      const { data: signed, error: se } = await getDb().storage.from(CLIENT_BUCKET).createSignedUploadUrl(path)
      if (se || !signed) throw se ?? new Error('signed')
      await putSigned(signed.signedUrl, file, onProgress)
    }
    const now = new Date().toISOString()
    const { error } = await getDb().from('client_files').insert({ ...base, title, name: file.name.slice(0, 200), mime_type: file.type || null, size: file.size, storage_path: path, version, status: 'livree', uploaded_by_kind: 'team', uploaded_by: userId, created_at: now, updated_at: now, deleted_at: null })
    if (error) throw error
    log('client.file', 'client', client.id, { title, version })
    void files.refresh()
  }
  async function removeFile(f: ClientFile) {
    files.setData((d) => d.filter((x) => x.id !== f.id))
    const { error } = await getDb().from('client_files').update({ deleted_at: new Date().toISOString() }).eq('id', f.id)
    if (error) { void files.refresh(); throw error }
    log('client.file.remove', 'client', client.id, { title: f.title, version: f.version })
  }
  const todo = canWrite ? {
    add: async (title: string, due: string | null) => {
      const position = Math.max(0, ...todos.data.map((x) => x.position)) + 1
      const { error } = await getDb().from('client_todos').insert({ ...base, title, due_date: due, done: false, done_at: null, position, created_at: new Date().toISOString(), deleted_at: null })
      if (error) throw error
      void todos.refresh()
    },
    toggle: async (x: ClientTodo) => {
      todos.setData((d) => d.map((y) => y.id === x.id ? { ...y, done: !x.done } : y))
      await getDb().from('client_todos').update({ done: !x.done, done_at: x.done ? null : new Date().toISOString() }).eq('id', x.id)
    },
    remove: async (x: ClientTodo) => {
      todos.setData((d) => d.filter((y) => y.id !== x.id))
      await getDb().from('client_todos').update({ deleted_at: new Date().toISOString() }).eq('id', x.id)
    },
  } : undefined

  async function save(v: ClientFields) {
    const { error } = await getDb().from('clients').update({ ...v, updated_at: new Date().toISOString() }).eq('id', client.id)
    if (error) { toast.error(t('common.error')); return }
    toast.success(t('cli.saved')); setEditing(false); void clientQ.refresh()
  }
  async function rotate() {
    const token = newClientToken()
    const { error } = await getDb().from('clients').update({ access_token: token, token_rotated_at: new Date().toISOString() }).eq('id', client.id)
    setConfirm(null)
    if (error) { toast.error(t('common.error')); return }
    log('client.rotate', 'client', client.id, {})
    void clientQ.refresh()
    await copy(token, t('cli.rotated'))
  }
  async function remove() {
    const { error } = await getDb().from('clients').update({ deleted_at: new Date().toISOString() }).eq('id', client.id)
    setConfirm(null)
    if (error) { toast.error(t('common.error')); return }
    log('client.delete', 'client', client.id, { name: client.name })
    toast.success(t('cli.deleted'))
    router.push(`/app/${ws.slug}/clients`)
  }

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <Link href={`/app/${ws.slug}/clients`} className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-text-3 hover:text-text"><ArrowLeft className="size-3.5" />{t('cli.back')}</Link>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Avatar name={client.name} size={44} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold tracking-tight">{client.name}</h1>
          <p className="truncate text-[13px] text-text-3">{[client.company, cadenceLabel(t, client)].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="primary" onClick={() => void copy(client.access_token)}><Link2 className="size-3.5" />{t('cli.copyLink')}</Button>
          <a href={`/c/${client.access_token}`} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="outline"><ExternalLink className="size-3.5" />{t('cli.openAsClient')}</Button></a>
          {canWrite && (
            <Menu align="end" trigger={({ toggle }) => <Button size="icon" variant="ghost" onClick={toggle} aria-label={t('common.more')}><MoreHorizontal className="size-4" /></Button>}>
              {(close) => <>
                <MenuItem icon={<Pencil className="size-3.5" />} onClick={() => { close(); setEditing(true) }}>{t('cli.edit')}</MenuItem>
                <MenuItem icon={<RefreshCw className="size-3.5" />} onClick={() => { close(); setConfirm('rotate') }}>{t('cli.rotate')}</MenuItem>
                <MenuItem danger icon={<Trash2 className="size-3.5" />} onClick={() => { close(); setConfirm('delete') }}>{t('cli.delete')}</MenuItem>
              </>}
            </Menu>
          )}
        </div>
      </div>
      {client.notes && <p className="mb-4 whitespace-pre-wrap rounded-xl border border-border bg-surface-2/50 px-4 py-3 text-[13px] text-text-2">{client.notes}</p>}

      <EtatClient cadence={client.cadence} files={files.data} todos={todos.data} messages={messages.data} />
      <div className="h-5" />
      <ClientSpace viewer="team" clientId={client.id} cadence={client.cadence} perPeriod={client.per_period} removeFile={canWrite ? removeFile : undefined} workspaceName={ws.name} messages={messages.data} files={files.data} todos={todos.data}
        authorName={authorName} send={send} upload={upload} urlOf={urlOf} todo={todo} />

      <ClientFormDialog open={editing} onClose={() => setEditing(false)} initial={client} onSubmit={save} title={t('cli.edit')} submitLabel={t('common.save')} />
      <Dialog open={!!confirm} onClose={() => setConfirm(null)} title={confirm === 'rotate' ? t('cli.rotate') : t('cli.delete')}
        footer={<><Button onClick={() => setConfirm(null)}>{t('common.cancel')}</Button>
          <Button variant={confirm === 'delete' ? 'danger' : 'primary'} onClick={() => void (confirm === 'rotate' ? rotate() : remove())}>{confirm === 'rotate' ? t('cli.rotate') : t('cli.delete')}</Button></>}>
        <p className="text-sm text-text-2">{confirm === 'rotate' ? t('cli.rotateConfirm') : t('cli.deleteConfirm')}</p>
      </Dialog>
    </div>
  )
}
