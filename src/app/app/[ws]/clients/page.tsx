'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { fr, enUS } from 'date-fns/locale'
import { Handshake, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Avatar, Badge, Card, EmptyState, PageHeader } from '@/components/ui/misc'
import { ClientFormDialog, cadenceLabel, type ClientFields } from '@/components/clients/client-form'
import { useLive } from '@/lib/hooks/use-live'
import { useSession } from '@/lib/hooks/use-session'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { getDb } from '@/lib/supabase/client'
import { useI18n } from '@/i18n/provider'
import { groupFiles, newClientToken, type ClientFile, type ClientMessage, type ClientRow, type ClientTodo } from '@/lib/clients'

export default function ClientsPage() {
  const { t, locale } = useI18n()
  const router = useRouter()
  const { ws, canWrite, log } = useWorkspace()
  const { userId } = useSession()
  const dfl = locale === 'fr' ? fr : enUS
  const clients = useLive<ClientRow>('clients', { eq: { workspace_id: ws.id }, is: { deleted_at: null }, order: ['created_at', false] })
  const files = useLive<ClientFile>('client_files', { select: 'id,client_id,title,version,created_at,status,deleted_at', eq: { workspace_id: ws.id }, is: { deleted_at: null } })
  const todos = useLive<Pick<ClientTodo, 'id' | 'client_id' | 'done'>>('client_todos', { select: 'id,client_id,done', eq: { workspace_id: ws.id }, is: { deleted_at: null } })
  const messages = useLive<Pick<ClientMessage, 'id' | 'client_id' | 'created_at'>>('client_messages', { select: 'id,client_id,created_at', eq: { workspace_id: ws.id }, is: { deleted_at: null } })
  const [creating, setCreating] = useState(false)

  const stats = useMemo(() => {
    const m = new Map<string, { files: number; todo: number; changes: number; toReview: number; last: string | null }>()
    const get = (id: string) => m.get(id) ?? { files: 0, todo: 0, changes: 0, toReview: 0, last: null }
    const bump = (id: string, at: string) => { const s = get(id); if (!s.last || at > s.last) s.last = at; m.set(id, s) }
    for (const f of files.data) { const s = get(f.client_id); s.files++; m.set(f.client_id, s); bump(f.client_id, f.created_at) }
    // état d'une vidéo = celui de sa dernière version (une V1 « modif » remplacée par une V2 validée ne compte plus)
    for (const id of new Set(files.data.map((f) => f.client_id))) {
      const s = get(id)
      for (const g of groupFiles(files.data.filter((f) => f.client_id === id))) { if (g.versions[0].status === 'modif') s.changes++; if (g.versions[0].status === 'livree') s.toReview++ }
      m.set(id, s)
    }
    for (const x of todos.data) { const s = get(x.client_id); if (!x.done) s.todo++; m.set(x.client_id, s) }
    for (const x of messages.data) bump(x.client_id, x.created_at)
    return m
  }, [files.data, todos.data, messages.data])

  async function create(v: ClientFields) {
    const now = new Date().toISOString()
    const { data, error } = await getDb().from('clients').insert({
      ...v, workspace_id: ws.id, access_token: newClientToken(), created_by: userId,
      // écrit en entier : le client de démo n'applique pas les valeurs par défaut de la base
      color: null, token_rotated_at: now, created_at: now, updated_at: now, deleted_at: null,
    }).select('*').single()
    if (error || !data) { toast.error(t('common.error')); return }
    log('client.create', 'client', (data as ClientRow).id, { name: v.name })
    toast.success(t('cli.created'))
    setCreating(false)
    router.push(`/app/${ws.slug}/clients/${(data as ClientRow).id}`)
  }

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <PageHeader title={t('cli.title')} subtitle={t('cli.sub')} icon={<Handshake className="size-4" />}
        actions={canWrite && <Button variant="primary" size="sm" onClick={() => setCreating(true)}><Plus className="size-4" />{t('cli.new')}</Button>} />
      {clients.loading && !clients.data.length
        ? <div className="grid gap-3 sm:grid-cols-2">{[0, 1].map((i) => <div key={i} className="skeleton h-28 rounded-xl" />)}</div>
        : clients.data.length === 0
          ? <EmptyState icon={<Handshake className="size-5" />} title={t('cli.empty')} hint={t('cli.emptyHint')}
              action={canWrite && <Button variant="primary" size="sm" onClick={() => setCreating(true)}><Plus className="size-4" />{t('cli.new')}</Button>} />
          : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {clients.data.map((c) => {
                const s = stats.get(c.id)
                return (
                  <li key={c.id}>
                    <Link href={`/app/${ws.slug}/clients/${c.id}`} className="block h-full">
                      <Card className="flex h-full items-start gap-3 p-4 transition-colors hover:border-border-strong">
                        <Avatar name={c.name} size={40} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="truncate text-[15px] font-semibold">{c.name}</h2>
                            {!!s?.changes && <Badge color="#f59e0b">{t('cli.st.modif')}</Badge>}
                            {!!s?.toReview && <Badge color="#6366f1">{t('cli.toReview', { n: s.toReview })}</Badge>}
                          </div>
                          {c.company && <p className="truncate text-[13px] text-text-2">{c.company}</p>}
                          <p className="mt-1 text-[12px] text-text-3">{cadenceLabel(t, c)}</p>
                          <p className="mt-2 text-[12px] text-text-3">
                            {t('cli.counts', { f: s?.files ?? 0, t: s?.todo ?? 0 })}
                            {s?.last && <> · {t('cli.lastActivity', { d: formatDistanceToNow(new Date(s.last), { addSuffix: true, locale: dfl }) })}</>}
                          </p>
                        </div>
                      </Card>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
      <ClientFormDialog open={creating} onClose={() => setCreating(false)} onSubmit={create} title={t('cli.new')} submitLabel={t('cli.create')} />
    </div>
  )
}
