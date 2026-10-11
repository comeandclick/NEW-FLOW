'use client'
import { useMemo, useState } from 'react'
import { Bell, BellOff, ExternalLink, File as FileIcon, Image as ImageIcon, Link2, LogOut, Plus, UserMinus, Video as VideoIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, Switch } from '@/components/ui/misc'
import { Dialog } from '@/components/ui/overlay'
import { AttachmentView } from './message-view'
import { getDb } from '@/lib/supabase/client'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useSession } from '@/lib/hooks/use-session'
import { useT } from '@/i18n/provider'
import { cn, formatBytes } from '@/lib/utils'
import type { Attachment, Conversation, ConvMember, Message } from '@/lib/types'

type Tab = 'image' | 'video' | 'file' | 'link'
const URL_RE = /https?:\/\/[^\s<>"')]+/g

/** Everything ever shared in a conversation, grouped by kind. */
export function sharedOf(msgs: Message[]) {
  const media: Record<Exclude<Tab, 'link'>, Attachment[]> = { image: [], video: [], file: [] }
  const links: { url: string; at: string }[] = []
  for (const m of msgs) {
    if (m.deleted_at) continue
    for (const a of m.attachments) {
      if (a.type === 'image') media.image.push(a)
      else if (a.type === 'video') media.video.push(a)
      else if (a.type === 'file') media.file.push(a)
    }
    for (const u of m.content?.match(URL_RE) ?? []) links.push({ url: u.replace(/[.,;!?]+$/, ''), at: m.created_at })
  }
  return { media, links }
}

export function ChannelInfo({ open, onClose, conv, members, msgs, onChanged }: {
  open: boolean; onClose: () => void; conv: Conversation; members: ConvMember[]; msgs: Message[]; onChanged: () => void
}) {
  const t = useT()
  const { userId } = useSession()
  const { members: wsMembers, profileOf, online, isAdmin, canWrite } = useWorkspace()
  const [name, setName] = useState(conv.name ?? '')
  const [desc, setDesc] = useState(conv.description ?? '')
  const [tab, setTab] = useState<Tab>('image')
  const [adding, setAdding] = useState(false)

  const mine = members.find((m) => m.user_id === userId)
  const canManage = canWrite && conv.type !== 'dm' && (conv.created_by === userId || isAdmin)
  const shared = useMemo(() => sharedOf(msgs), [msgs])
  const candidates = wsMembers.filter((w) => !members.some((m) => m.user_id === w.user_id))
  const onlineCount = members.filter((m) => online.has(m.user_id)).length

  async function saveInfo() {
    const n = name.trim()
    if (conv.type === 'channel' && !n) return
    const { error } = await getDb().from('conversations').update({ name: n || null, description: desc.trim() || null }).eq('id', conv.id)
    if (error) { toast.error(t('common.error')); return }
    toast.success(t('common.saved')); onChanged()
  }
  async function setMuted(v: boolean) {
    if (!mine) return
    await getDb().from('conversation_members').update({ muted: v }).eq('id', mine.id)
  }
  async function add(uid: string) {
    const { error } = await getDb().from('conversation_members').insert({ conversation_id: conv.id, user_id: uid })
    if (error) toast.error(t('common.error'))
  }
  async function remove(m: ConvMember) {
    await getDb().from('conversation_members').delete().eq('id', m.id)
    if (m.user_id === userId) onClose()
  }

  const tabs: { k: Tab; icon: typeof ImageIcon; n: number }[] = [
    { k: 'image', icon: ImageIcon, n: shared.media.image.length }, { k: 'video', icon: VideoIcon, n: shared.media.video.length },
    { k: 'file', icon: FileIcon, n: shared.media.file.length }, { k: 'link', icon: Link2, n: shared.links.length },
  ]

  return (
    <Dialog open={open} onClose={onClose} title={conv.type === 'dm' ? t('chi.titleDm') : t('chi.title')} size="md">
      <div className="space-y-5">
        {conv.type !== 'dm' && (
          <section className="space-y-2">
            <label className="block text-xs font-medium text-text-2">{t('chi.name')}
              <Input className="mt-1" value={name} disabled={!canManage} maxLength={60} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="block text-xs font-medium text-text-2">{t('chi.desc')}
              <Input className="mt-1" value={desc} disabled={!canManage} maxLength={200} onChange={(e) => setDesc(e.target.value)} />
            </label>
            {canManage && <Button size="sm" variant="primary" onClick={saveInfo} disabled={name === (conv.name ?? '') && desc === (conv.description ?? '')}>{t('common.save')}</Button>}
          </section>
        )}

        <section className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5">
          {mine?.muted ? <BellOff className="size-4 text-text-3" /> : <Bell className="size-4 text-accent-ink" />}
          <div className="min-w-0 flex-1"><div className="text-sm font-medium">{t('chi.notif')}</div><div className="text-xs text-text-3">{mine?.muted ? t('chi.notifOff') : t('chi.notifOn')}</div></div>
          <Switch checked={!mine?.muted} onChange={(v) => setMuted(!v)} label={t('chi.notif')} />
        </section>

        <section>
          <div className="mb-1.5 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-text-3">{t('chi.members', { n: members.length })} · {t('chi.online', { n: onlineCount })}</h3>
            {canManage && candidates.length > 0 && <Button size="sm" variant="ghost" onClick={() => setAdding((a) => !a)}><Plus className="size-3.5" />{t('chi.add')}</Button>}
          </div>
          {adding && (
            <ul className="mb-2 max-h-40 overflow-y-auto rounded-xl border border-border p-1">
              {candidates.map((w) => (
                <li key={w.user_id}><button onClick={() => add(w.user_id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-surface-2"><Avatar name={w.profile?.full_name} src={w.profile?.avatar_url} size={22} />{w.profile?.full_name ?? w.profile?.email}<Plus className="ml-auto size-3.5 text-text-3" /></button></li>
              ))}
            </ul>
          )}
          <ul className="divide-y divide-border">
            {members.map((m) => {
              const p = profileOf(m.user_id); const on = online.has(m.user_id)
              return (
                <li key={m.id} className="flex items-center gap-3 py-2">
                  <Avatar name={p?.full_name ?? p?.email} src={p?.avatar_url} size={30} status={on ? 'online' : 'offline'} />
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{p?.full_name ?? p?.email}{m.user_id === userId && <span className="ml-1.5 text-xs font-normal text-text-3">{t('chi.you')}</span>}</div>
                    <div className={cn('text-xs', on ? 'text-success' : 'text-text-3')}>{on ? t('chi.isOnline') : t('chi.isOffline')}{m.role === 'owner' ? ` · ${t('chi.owner')}` : ''}</div></div>
                  {conv.type !== 'dm' && (m.user_id === userId
                    ? <Button size="icon" variant="ghost" onClick={() => remove(m)} aria-label={t('chi.leave')} title={t('chi.leave')}><LogOut className="size-4" /></Button>
                    : canManage && <Button size="icon" variant="ghost" onClick={() => remove(m)} aria-label={t('chi.remove')} title={t('chi.remove')}><UserMinus className="size-4" /></Button>)}
                </li>
              )
            })}
          </ul>
        </section>

        <section>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-text-3">{t('chi.shared')}</h3>
          <div role="tablist" className="mb-2 flex gap-1 rounded-xl bg-surface-2 p-1">
            {tabs.map(({ k, icon: Icon, n }) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={cn('flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-colors', tab === k ? 'bg-surface text-text shadow-sm' : 'text-text-3 hover:text-text')}>
                <Icon className="size-3.5" /><span className="max-sm:sr-only">{t(`chi.tab.${k}` as 'chi.tab.image')}</span><span className="tabular-nums">{n}</span>
              </button>
            ))}
          </div>
          <div className="max-h-64 overflow-y-auto">
            {tab === 'link' ? (
              shared.links.length ? <ul className="space-y-1">{[...shared.links].reverse().map((l, i) => (
                <li key={i}><a href={l.url} target="_blank" rel="noreferrer noopener" className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-accent-ink hover:bg-surface-2"><ExternalLink className="size-3.5 shrink-0" /><span className="truncate">{l.url}</span></a></li>
              ))}</ul> : <p className="py-4 text-center text-sm text-text-3">{t('chi.none')}</p>
            ) : shared.media[tab].length ? (
              <div className={cn(tab === 'file' ? 'space-y-1.5' : 'grid grid-cols-2 gap-2')}>{[...shared.media[tab]].reverse().map((a, i) => <div key={i} className="min-w-0"><AttachmentView att={a} />{tab !== 'file' && a.size ? <div className="mt-0.5 text-[11px] text-text-3">{formatBytes(a.size)}</div> : null}</div>)}</div>
            ) : <p className="py-4 text-center text-sm text-text-3">{t('chi.none')}</p>}
          </div>
        </section>
      </div>
    </Dialog>
  )
}
