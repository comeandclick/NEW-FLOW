'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { HubTabs } from '@/components/shell/hub-tabs'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Check, Copy, Download, Settings, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, Badge, PageHeader, Tabs } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/input'
import { Dialog } from '@/components/ui/overlay'
import { LanguageToggle, ThemeToggle } from '@/components/ui/toggles'
import { useLive } from '@/lib/hooks/use-live'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useSession } from '@/lib/hooks/use-session'
import { getDb } from '@/lib/supabase/client'
import { uploadToBucket } from '@/lib/storage'
import { enablePush, pushPermission } from '@/lib/push'
import { useI18n } from '@/i18n/provider'
import type { Role } from '@/lib/types'

type Tab = 'profile' | 'workspace' | 'members' | 'preferences'
const EXPORT_TABLES = ['projects', 'tasks', 'notes', 'events', 'goals', 'crm_contacts', 'crm_deals', 'invoices', 'forms', 'habits', 'automations', 'files']

export default function SettingsPage() {
  const { t } = useI18n()
  const [tab, setTab] = useState<Tab>('profile')
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <HubTabs hub="settings" />
      <PageHeader title={t('set.title')} icon={<Settings className="size-[18px]" />} />
      <Tabs className="mb-6 max-w-full overflow-x-auto" value={tab} onChange={setTab} items={[
        { value: 'profile', label: t('set.tab.profile') }, { value: 'workspace', label: t('set.tab.workspace') }, { value: 'members', label: t('set.tab.members') }, { value: 'preferences', label: t('set.tab.preferences') }]} />
      {tab === 'profile' && <ProfileTab />}{tab === 'workspace' && <WorkspaceTab />}{tab === 'members' && <MembersTab />}{tab === 'preferences' && <PreferencesTab />}
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return <section className="mb-6 rounded-2xl border border-border bg-surface p-5"><h2 className="text-sm font-semibold">{title}</h2>{hint && <p className="mt-0.5 text-[13px] text-text-3">{hint}</p>}<div className="mt-4 space-y-4">{children}</div></section>
}

function ProfileTab() {
  const { t } = useI18n()
  const { profile, updateProfile, userId, isDemo } = useSession()
  const [name, setName] = useState(profile?.full_name ?? '')
  const [busy, setBusy] = useState(false)
  const [avatar, setAvatar] = useState(profile?.avatar_url ?? null)
  const file = useRef<HTMLInputElement>(null)
  useEffect(() => { setName(profile?.full_name ?? ''); setAvatar(profile?.avatar_url ?? null) }, [profile])
  async function save() { setBusy(true); await updateProfile({ full_name: name.trim() }); setBusy(false); toast.success(t('common.saved')) }
  async function pick(f: File) {
    if (!userId || f.size > 5 * 1024 * 1024) { toast.error('5 MB max'); return }
    try {
      const path = await uploadToBucket('avatars', userId, f, f.name)
      const url = getDb().storage.from('avatars').getPublicUrl(path).data.publicUrl
      setAvatar(url); await updateProfile({ avatar_url: url }); toast.success(t('common.saved'))
    } catch { toast.error(t('common.error')) }
  }
  return (
    <>
      <Section title={t('set.tab.profile')}>
        <div className="flex items-center gap-4"><Avatar name={name} src={avatar} size={64} />
          <div><input ref={file} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
            <Button onClick={() => file.current?.click()}><Camera className="size-4" />{t('set.profile.change')}</Button><p className="mt-1 text-xs text-text-3">{t('set.profile.avatar')}</p></div></div>
        <Field label={t('set.profile.name')}><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label={t('set.profile.email')}><Input value={profile?.email ?? ''} readOnly disabled /></Field>
        <Field label={t('set.profile.status')}><Select value={profile?.status ?? 'online'} onChange={(e) => updateProfile({ status: e.target.value })}>
          {(['online', 'away', 'dnd', 'offline'] as const).map((s) => <option key={s} value={s}>{t(`set.status.${s}`)}</option>)}</Select></Field>
        <div className="flex justify-end"><Button variant="primary" loading={busy} onClick={save} disabled={!name.trim()}>{t('common.save')}</Button></div>
        {isDemo && <p className="text-xs text-text-3">{t('common.demoBanner')}</p>}
      </Section>
    </>
  )
}

function WorkspaceTab() {
  const { t } = useI18n()
  const router = useRouter()
  const { ws, isAdmin, role } = useWorkspace()
  const { userId } = useSession()
  const [name, setName] = useState(ws.name)
  const [confirm, setConfirm] = useState(false)
  const [typed, setTyped] = useState('')
  async function save() { await getDb().from('workspaces').update({ name: name.trim() }).eq('id', ws.id); toast.success(t('common.saved')); window.location.reload() }
  async function exportAll() {
    const out: Record<string, unknown> = { exported_at: new Date().toISOString(), workspace: ws }
    for (const tb of EXPORT_TABLES) out[tb] = ((await getDb().from(tb).select('*').eq('workspace_id', ws.id)).data) ?? []
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `flow-${ws.slug}.json`; a.click(); URL.revokeObjectURL(a.href)
  }
  async function del() { await getDb().from('workspaces').delete().eq('id', ws.id); router.replace('/app') }
  async function leave() { await getDb().from('workspace_members').delete().eq('workspace_id', ws.id).eq('user_id', userId); router.replace('/app') }
  return (
    <>
      <Section title={t('set.tab.workspace')}>
        <Field label={t('set.ws.name')}><Input value={name} disabled={!isAdmin} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label={t('set.ws.slug')}><Input value={`/app/${ws.slug}`} readOnly disabled /></Field>
        {isAdmin && <div className="flex justify-end"><Button variant="primary" onClick={save} disabled={!name.trim() || name === ws.name}>{t('common.save')}</Button></div>}
      </Section>
      <Section title={t('set.ws.export')} hint={t('set.ws.exportHint')}><Button onClick={exportAll}><Download className="size-4" />{t('set.ws.export')}</Button></Section>
      <Section title={t('set.ws.danger')}>
        {role === 'owner' ? <div className="flex items-center justify-between gap-3"><div><div className="text-sm font-medium">{t('set.ws.delete')}</div><div className="text-xs text-text-3">{t('set.ws.deleteHint')}</div></div>
          <Button variant="danger" onClick={() => setConfirm(true)}><Trash2 className="size-4" />{t('common.delete')}</Button></div>
          : <Button variant="outline" onClick={leave}>{t('set.ws.leave')}</Button>}
      </Section>
      <Dialog open={confirm} onClose={() => setConfirm(false)} title={t('set.ws.delete')} size="sm"
        footer={<><Button onClick={() => setConfirm(false)}>{t('common.cancel')}</Button><Button variant="danger" disabled={typed !== ws.name} onClick={del}>{t('common.delete')}</Button></>}>
        <Field label={t('set.ws.deleteConfirm')}><Input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={ws.name} /></Field>
      </Dialog>
    </>
  )
}

function MembersTab() {
  const { t } = useI18n()
  const { ws, members, isAdmin, refreshMembers } = useWorkspace()
  const { userId, isDemo } = useSession()
  const invites = useLive<any>('invitations', { eq: { workspace_id: ws.id }, is: { accepted_at: null }, order: ['created_at', false], enabled: isAdmin })
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'member' | 'viewer'>('member')
  const [link, setLink] = useState('')
  const [copied, setCopied] = useState(false)

  async function invite() {
    if (isDemo) { toast.info(t('set.members.demo')); return }
    const { data, error } = await getDb().from('invitations').insert({ workspace_id: ws.id, email: email.trim().toLowerCase(), role, invited_by: userId }).select().single()
    if (error || !data) { toast.error(t('common.error')); return }
    setLink(`${window.location.origin}/invite/${(data as any).token}`); setEmail(''); invites.refresh()
  }
  async function changeRole(id: string, r: Role) { await getDb().from('workspace_members').update({ role: r }).eq('id', id); await refreshMembers(); toast.success(t('common.saved')) }
  async function remove(id: string) { await getDb().from('workspace_members').delete().eq('id', id); await refreshMembers(); toast.success(t('set.members.removed')) }

  return (
    <>
      {isAdmin && (
        <Section title={t('set.members.invite')}>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nom@exemple.com" aria-label={t('set.members.email')} />
            <Select className="sm:w-40" value={role} onChange={(e) => setRole(e.target.value as any)} aria-label={t('set.members.role')}>{(['admin', 'member', 'viewer'] as const).map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}</Select>
            <Button variant="primary" onClick={invite} disabled={!email.includes('@')}>{t('set.members.invite')}</Button>
          </div>
          {link && <div className="rounded-xl bg-surface-2 p-3"><div className="mb-1 text-xs text-text-3">{t('set.members.link')} · {t('set.members.linkHint')}</div>
            <div className="flex gap-2"><Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} /><Button onClick={() => { void navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>{copied ? <Check className="size-4" /> : <Copy className="size-4" />}</Button></div></div>}
          {invites.data.length > 0 && <div><div className="mb-1.5 text-xs font-medium text-text-3">{t('set.members.pending')}</div><ul className="space-y-1">{invites.data.map((i: any) => <li key={i.id} className="flex items-center gap-2 text-[13px]"><span className="flex-1 truncate">{i.email}</span><Badge>{t(`role.${i.role}` as any)}</Badge>
            <button onClick={async () => { await getDb().from('invitations').delete().eq('id', i.id); invites.refresh() }} className="text-text-3 hover:text-danger" aria-label={t('common.delete')}><Trash2 className="size-3.5" /></button></li>)}</ul></div>}
        </Section>
      )}
      <Section title={`${t('set.tab.members')} (${members.length})`} hint={!isAdmin ? t('set.members.cantChange') : undefined}>
        <ul className="-my-2 divide-y divide-border">{members.map((m) => (
          <li key={m.id} className="flex items-center gap-3 py-3"><Avatar name={m.profile?.full_name} src={m.profile?.avatar_url} size={34} status={m.profile?.status} />
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{m.profile?.full_name}</div><div className="truncate text-xs text-text-3">{m.profile?.email}</div></div>
            {isAdmin && m.role !== 'owner' && m.user_id !== userId ? <><Select className="h-8 w-36" value={m.role} onChange={(e) => changeRole(m.id, e.target.value as Role)}>{(['admin', 'member', 'viewer'] as const).map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}</Select>
              <Button variant="ghost" size="icon" onClick={() => remove(m.id)} aria-label={t('set.members.remove')}><Trash2 className="size-4" /></Button></> : <Badge>{t(`role.${m.role}`)}</Badge>}
          </li>))}</ul>
      </Section>
    </>
  )
}

function PreferencesTab() {
  const { t } = useI18n()
  const { isDemo } = useSession()
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>('default')
  useEffect(() => { setPerm(pushPermission()) }, [])

  return (
    <>
      <Section title={t('common.language')}><LanguageToggle size="sm" /></Section>
      <Section title={t('common.theme')}><ThemeToggle size="sm" /></Section>
      <Section title={t('set.pref.notifications')} hint={t('set.pref.notificationsHint')}>
        {perm === 'granted' ? <Badge color="var(--success)"><Check className="size-3" />{t('set.pref.enabled')}</Badge>
          : perm === 'denied' ? <Badge color="var(--danger)">{t('set.pref.blocked')}</Badge>
          : perm === 'unsupported' ? <Badge>—</Badge>
          : <Button variant="primary" onClick={async () => setPerm(await enablePush(isDemo))}>{t('set.pref.enable')}</Button>}
      </Section>
    </>
  )
}
