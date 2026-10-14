'use client'
 
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { Hash, Lock, Plus, Search, UserPlus, Video } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { Avatar, Switch } from '@/components/ui/misc'
import { Dialog } from '@/components/ui/overlay'
import { useLive } from '@/lib/hooks/use-live'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useSession } from '@/lib/hooks/use-session'
import { useUnread } from '@/lib/hooks/use-unread'
import { getDb } from '@/lib/supabase/client'
import { useT } from '@/i18n/provider'
import { cn } from '@/lib/utils'
import type { Conversation, ConvMember } from '@/lib/types'

export function useConversations() {
  const { ws } = useWorkspace()
  const { userId } = useSession()
  const convs = useLive<Conversation>('conversations', { eq: { workspace_id: ws.id }, order: ['updated_at', false] })
  const ids = useMemo(() => convs.data.map((c) => c.id), [convs.data])
  const members = useLive<ConvMember>('conversation_members', { enabled: ids.length > 0, in: { conversation_id: ids } })
  const mine = useMemo(() => new Set(members.data.filter((m) => m.user_id === userId).map((m) => m.conversation_id)), [members.data, userId])
  return { convs: convs.data, members: members.data, mine, loading: convs.loading, refresh: async () => { await convs.refresh(); await members.refresh() } }
}

export function ConversationList() {
  const t = useT()
  const router = useRouter()
  const pathname = usePathname()
  const { ws, members: wsMembers, profileOf, canWrite } = useWorkspace()
  const { userId } = useSession()
  const { convs, members, mine, refresh } = useConversations()
  const unread = useUnread(ws.id, userId)
  const [q, setQ] = useState('')
  const [dlg, setDlg] = useState<'channel' | 'dm' | null>(null)
  const [name, setName] = useState('')
  const [priv, setPriv] = useState(false)
  const base = `/app/${ws.slug}/messages`

  const dmLabel = (c: Conversation) => {
    const other = members.find((m) => m.conversation_id === c.id && m.user_id !== userId)
    return { name: profileOf(other?.user_id)?.full_name ?? profileOf(other?.user_id)?.email ?? '—', user: profileOf(other?.user_id) }
  }
  const visible = convs.filter((c) => mine.has(c.id) || (c.type === 'channel' && !c.is_private))
  const channels = visible.filter((c) => c.type === 'channel' && (!q || c.name?.toLowerCase().includes(q.toLowerCase())))
  const dms = visible.filter((c) => c.type !== 'channel' && (!q || dmLabel(c).name.toLowerCase().includes(q.toLowerCase())))

  async function createChannel() {
    const n = name.trim().toLowerCase().replace(/\s+/g, '-')
    if (!n || !userId) return
    if (convs.some((c) => c.type === 'channel' && c.name === n)) { toast.error(t('msg.channelExists')); return }
    const { data, error } = await getDb().from('conversations').insert({ workspace_id: ws.id, type: 'channel', name: n, is_private: priv, created_by: userId }).select().single()
    if (error || !data) { toast.error(t('common.error')); return }
    await getDb().from('conversation_members').insert({ conversation_id: (data as any).id, user_id: userId, role: 'owner' })
    if (!priv) await getDb().from('conversation_members').insert(wsMembers.filter((m) => m.user_id !== userId).map((m) => ({ conversation_id: (data as any).id, user_id: m.user_id })))
    setDlg(null); setName(''); setPriv(false); await refresh(); router.push(`${base}/${(data as any).id}`)
  }
  async function openDm(other: string) {
    const { data, error } = await getDb().rpc('open_dm', { p_workspace: ws.id, p_other: other }).single()
    if (error || !data) { toast.error(t('common.error')); return }
    setDlg(null); await refresh(); router.push(`${base}/${data as string}`)
  }
  async function join(c: Conversation) {
    if (!userId || mine.has(c.id)) return
    await getDb().from('conversation_members').insert({ conversation_id: c.id, user_id: userId })
    await refresh()
  }

  const Row = ({ c, label, icon }: { c: Conversation; label: string; icon: React.ReactNode }) => {
    const active = pathname === `${base}/${c.id}`
    const n = unread.byConv[c.id] ?? 0
    return (
      <Link href={`${base}/${c.id}`} onClick={() => join(c)} aria-current={active ? 'page' : undefined}
        className={cn('flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors', active ? 'bg-surface-3 font-medium' : 'text-text-2 hover:bg-surface-2', n > 0 && 'font-semibold text-text')}>
        {icon}<span className="min-w-0 flex-1 truncate">{label}</span>
        {n > 0 && <span className="rounded-full bg-accent px-1.5 text-[10px] font-semibold leading-4 text-accent-text">{n}</span>}
      </Link>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3.5 pb-2 pt-4"><h1 className="text-base font-semibold">{t('msg.title')}</h1>
        <div className="flex gap-0.5"><Link href={`${base.replace('/messages', '')}/meetings`} aria-label={t('nav.meetings')} title={t('nav.meetings')} className="flex size-8 items-center justify-center rounded-lg text-text-2 transition-colors hover:bg-surface-2 hover:text-text"><Video className="size-4" /></Link>
        {canWrite && <><Button variant="ghost" size="icon" onClick={() => setDlg('dm')} aria-label={t('msg.newDm')}><UserPlus className="size-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => setDlg('channel')} aria-label={t('msg.newChannel')}><Plus className="size-4" /></Button></>}</div></div>
      <div className="px-3 pb-2"><div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-text-3" /><Input className="h-8 pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('common.search')} /></div></div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-2 pb-4">
        <section><div className="px-2.5 pb-1 text-[11px] font-medium uppercase tracking-wider text-text-3">{t('msg.channels')}</div>
          {channels.map((c) => <Row key={c.id} c={c} label={c.name ?? ''} icon={c.is_private ? <Lock className="size-3.5 text-text-3" /> : <Hash className="size-3.5 text-text-3" />} />)}</section>
        <section><div className="px-2.5 pb-1 text-[11px] font-medium uppercase tracking-wider text-text-3">{t('msg.direct')}</div>
          {dms.map((c) => { const d = dmLabel(c); return <Row key={c.id} c={c} label={d.name} icon={<Avatar name={d.name} src={d.user?.avatar_url} size={20} status={d.user?.status} />} /> })}</section>
      </div>

      <Dialog open={dlg === 'channel'} onClose={() => setDlg(null)} title={t('msg.newChannel')} size="sm"
        footer={<><Button onClick={() => setDlg(null)}>{t('common.cancel')}</Button><Button variant="primary" onClick={createChannel} disabled={!name.trim()}>{t('common.create')}</Button></>}>
        <div className="space-y-4"><Field label={t('msg.channelName')}><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && createChannel()} placeholder="marketing" /></Field>
          <div className="flex items-center justify-between"><span className="text-sm">{t('msg.channelPrivate')}</span><Switch checked={priv} onChange={setPriv} label={t('msg.channelPrivate')} /></div></div>
      </Dialog>
      <Dialog open={dlg === 'dm'} onClose={() => setDlg(null)} title={t('msg.newDm')} size="sm">
        <ul className="space-y-1">{wsMembers.filter((m) => m.user_id !== userId).map((m) => (
          <li key={m.id}><button onClick={() => openDm(m.user_id)} className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-surface-2">
            <Avatar name={m.profile?.full_name} src={m.profile?.avatar_url} size={28} status={m.profile?.status} /><span className="text-sm">{m.profile?.full_name ?? m.profile?.email}</span></button></li>
        ))}</ul>
      </Dialog>
    </div>
  )
}
