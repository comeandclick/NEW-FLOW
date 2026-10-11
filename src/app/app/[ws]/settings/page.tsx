'use client'
 
import { HubTabs } from '@/components/shell/hub-tabs'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Camera, Check, Copy, Download, Settings, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, Badge, PageHeader, Tabs } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Dialog } from '@/components/ui/overlay'
import { ApiTab } from './api-tab'
import { StudioTab } from './studio-tab'
import { ProfileTab } from './profile-tab'
import { PreferencesTab } from './preferences-tab'
import { Section } from './section'
import { LanguageToggle, ThemeToggle } from '@/components/ui/toggles'
import { useLive } from '@/lib/hooks/use-live'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useSession } from '@/lib/hooks/use-session'
import { getDb } from '@/lib/supabase/client'
import { uploadToBucket } from '@/lib/storage'
import { importKalimat } from '@/lib/import-kalimat'
import { enablePush, pushPermission } from '@/lib/push'
import { useI18n } from '@/i18n/provider'
import type { Role } from '@/lib/types'

type Tab = 'profile' | 'workspace' | 'members' | 'preferences' | 'api' | 'studio'
const EXPORT_TABLES = ['projects', 'tasks', 'notes', 'events', 'goals', 'crm_contacts', 'crm_deals', 'invoices', 'forms', 'habits', 'automations', 'files']

function SettingsInner() {
  const { t } = useI18n()
  const q = useSearchParams().get('tab')
  const [tab, setTab] = useState<Tab>(q === 'members' || q === 'workspace' || q === 'preferences' || q === 'api' || q === 'studio' ? q : 'profile')
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <HubTabs hub="settings" />
      <PageHeader title={t('set.title')} icon={<Settings className="size-[18px]" />} />
      <Tabs className="mb-6 max-w-full overflow-x-auto" value={tab} onChange={setTab} items={[
        { value: 'profile', label: t('set.tab.profile') }, { value: 'workspace', label: t('set.tab.workspace') }, { value: 'members', label: t('set.tab.members') }, { value: 'preferences', label: t('set.tab.preferences') }, { value: 'api', label: t('set.tab.api') }, { value: 'studio', label: t('set.tab.studio') }]} />
      {tab === 'profile' && <ProfileTab />}{tab === 'workspace' && <WorkspaceTab />}{tab === 'members' && <MembersTab />}{tab === 'preferences' && <PreferencesTab />}{tab === 'api' && <ApiTab />}{tab === 'studio' && <StudioTab />}
    </div>
  )
}

export default function SettingsPage() { return <Suspense><SettingsInner /></Suspense> }

function WorkspaceTab() {
  const { t } = useI18n()
  const router = useRouter()
  const { ws, isAdmin, role } = useWorkspace()
  const { userId } = useSession()
  const [name, setName] = useState(ws.name)
  const [confirm, setConfirm] = useState(false)
  const [typed, setTyped] = useState('')
  const [importing, setImporting] = useState(false)
  const [desc, setDesc] = useState(String((ws.settings as { description?: string })?.description ?? ''))
  const [logo, setLogo] = useState(ws.logo_url)
  const logoInput = useRef<HTMLInputElement>(null)
  async function save() {
    // Merge into the latest settings so API keys / alert routes stored there are never overwritten.
    const { data: cur } = await getDb().from('workspaces').select('settings').eq('id', ws.id).single()
    const settings = { ...((cur as { settings?: object } | null)?.settings ?? {}), description: desc.trim() }
    await getDb().from('workspaces').update({ name: name.trim(), settings }).eq('id', ws.id); toast.success(t('common.saved')); window.location.reload()
  }
  async function pickLogo(f: File) {
    if (!userId || f.size > 2 * 1024 * 1024 || !f.type.startsWith('image/')) { toast.error('2 MB max'); return }
    try {
      const path = await uploadToBucket('avatars', userId, f, f.name)
      const url = getDb().storage.from('avatars').getPublicUrl(path).data.publicUrl
      await getDb().from('workspaces').update({ logo_url: url }).eq('id', ws.id); setLogo(url); toast.success(t('common.saved'))
    } catch { toast.error(t('common.error')) }
  }
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
        <div className="flex items-center gap-4"><Avatar name={ws.name} src={logo} size={56} />
          {isAdmin && <div><input ref={logoInput} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && pickLogo(e.target.files[0])} /><Button onClick={() => logoInput.current?.click()}><Camera className="size-4" />{t('set.ws.logo')}</Button></div>}</div>
        <Field label={t('set.ws.name')}><Input value={name} disabled={!isAdmin} maxLength={60} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label={t('set.ws.desc')}><Textarea rows={3} value={desc} disabled={!isAdmin} maxLength={300} onChange={(e) => setDesc(e.target.value)} placeholder={t('set.ws.descPh')} /></Field>
        <Field label={t('set.ws.slug')}><Input value={`/app/${ws.slug}`} readOnly disabled /></Field>
        {isAdmin && <div className="flex justify-end"><Button variant="primary" onClick={save} disabled={!name.trim() || (name === ws.name && desc.trim() === String((ws.settings as { description?: string })?.description ?? ''))}>{t('common.save')}</Button></div>}
      </Section>
      <Section title={t('set.import.title')} hint={t('set.import.hint')}>
        <Button loading={importing} onClick={async () => { if (!userId) return; setImporting(true); try { router.push(`/app/${await importKalimat(userId)}`) } catch { toast.error(t('common.error')); setImporting(false) } }}>{t('set.import.cta')}</Button>
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
