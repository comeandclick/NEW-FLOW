'use client'
/** Accueil : les clients qui attendent quelque chose (vidéo à valider, modification demandée, nouveau message). Caché s'il n'y a rien. */
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Handshake } from 'lucide-react'
import { Avatar, Badge, Card } from '@/components/ui/misc'
import { useLive } from '@/lib/hooks/use-live'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useI18n } from '@/i18n/provider'
import { getSeen, groupFiles, type ClientFile, type ClientMessage, type ClientRow } from '@/lib/clients'

export function ClientsWidget() {
  const { t } = useI18n()
  const { ws } = useWorkspace()
  const clients = useLive<ClientRow>('clients', { select: 'id,name,company,deleted_at', eq: { workspace_id: ws.id }, is: { deleted_at: null } })
  const files = useLive<ClientFile>('client_files', { select: 'id,client_id,title,version,status,created_at,updated_at,uploaded_by_kind,deleted_at', eq: { workspace_id: ws.id }, is: { deleted_at: null } })
  const messages = useLive<Pick<ClientMessage, 'id' | 'client_id' | 'created_at' | 'author_kind'>>('client_messages', { select: 'id,client_id,created_at,author_kind', eq: { workspace_id: ws.id }, is: { deleted_at: null } })
  // la date de dernière visite vit dans le navigateur : lue après l'affichage
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])

  const rows = useMemo(() => clients.data.map((c) => {
    const groups = groupFiles(files.data.filter((f) => f.client_id === c.id && f.uploaded_by_kind === 'team'))
    const seen = ready ? getSeen(c.id, 'team') : null
    return {
      c,
      changes: groups.filter((g) => g.versions[0].status === 'modif').length,
      toReview: groups.filter((g) => g.versions[0].status === 'livree').length,
      unread: seen ? messages.data.filter((m) => m.client_id === c.id && m.author_kind === 'client' && m.created_at > seen).length : 0,
    }
  }).filter((r) => r.changes || r.unread).sort((a, b) => b.changes - a.changes || b.unread - a.unread), [clients.data, files.data, messages.data, ready])

  if (!rows.length) return null
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><Handshake className="size-4 text-text-3" />{t('cli.home.title')}</h2>
        <Link href={`/app/${ws.slug}/clients`} className="flex items-center gap-1 text-[12px] text-text-3 hover:text-text">{t('cli.home.all')}<ArrowRight className="size-3" /></Link>
      </div>
      <ul className="p-2">
        {rows.slice(0, 5).map(({ c, changes, toReview, unread }) => (
          <li key={c.id}>
            <Link href={`/app/${ws.slug}/clients/${c.id}`} className="flex items-center gap-3 rounded-lg p-2.5 hover:bg-surface-2">
              <Avatar name={c.name} size={28} />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{c.name}</span>
              <span className="flex shrink-0 flex-wrap justify-end gap-1">
                {!!changes && <Badge color="#f59e0b">{t('cli.sum.changes', { n: changes })}</Badge>}
                {!!unread && <Badge color="#6366f1">{t('cli.home.unread', { n: unread })}</Badge>}
                {!changes && !!toReview && <Badge>{t('cli.toReview', { n: toReview })}</Badge>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}
