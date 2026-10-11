'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/input'
import { Dialog } from '@/components/ui/overlay'
import { useSession } from '@/lib/hooks/use-session'
import { getDb } from '@/lib/supabase/client'
import { uploadToBucket } from '@/lib/storage'
import { useI18n } from '@/i18n/provider'
import { Section } from './section'

export function ProfileTab() {
  const { t } = useI18n()
  const { profile, updateProfile, userId, isDemo, signOut } = useSession()
  const [name, setName] = useState(profile?.full_name ?? '')
  const [tz, setTz] = useState(profile?.timezone ?? 'Europe/Paris')
  const [busy, setBusy] = useState(false)
  const [avatar, setAvatar] = useState(profile?.avatar_url ?? null)
  const file = useRef<HTMLInputElement>(null)
  useEffect(() => { setName(profile?.full_name ?? ''); setTz(profile?.timezone ?? 'Europe/Paris'); setAvatar(profile?.avatar_url ?? null) }, [profile])
  const zones = useMemo(() => { try { return Intl.supportedValuesOf('timeZone') } catch { return ['Europe/Paris', 'UTC'] } }, [])
  const dirty = name.trim() !== (profile?.full_name ?? '') || tz !== (profile?.timezone ?? 'Europe/Paris')

  async function save() { setBusy(true); await updateProfile({ full_name: name.trim(), timezone: tz }); setBusy(false); toast.success(t('common.saved')) }
  async function pick(f: File) {
    if (!userId || f.size > 5 * 1024 * 1024) { toast.error('5 MB max'); return }
    try {
      const path = await uploadToBucket('avatars', userId, f, f.name)
      const url = getDb().storage.from('avatars').getPublicUrl(path).data.publicUrl
      setAvatar(url); await updateProfile({ avatar_url: url }); toast.success(t('common.saved'))
    } catch { toast.error(t('common.error')) }
  }

  // security
  const [pwd, setPwd] = useState(''); const [pwd2, setPwd2] = useState(''); const [pwdBusy, setPwdBusy] = useState(false)
  const [email, setEmail] = useState(''); const [emailBusy, setEmailBusy] = useState(false)
  async function changePassword() {
    if (pwd.length < 8) { toast.error(t('set.sec.pwdShort')); return }
    if (pwd !== pwd2) { toast.error(t('set.sec.pwdMismatch')); return }
    setPwdBusy(true)
    const { error } = await getDb().auth.updateUser({ password: pwd })
    setPwdBusy(false)
    if (error) toast.error(error.message); else { setPwd(''); setPwd2(''); toast.success(t('set.sec.pwdDone')) }
  }
  async function changeEmail() {
    setEmailBusy(true)
    const { error } = await getDb().auth.updateUser({ email: email.trim() })
    setEmailBusy(false)
    if (error) toast.error(error.message); else { setEmail(''); toast.success(t('set.sec.emailSent')) }
  }
  async function signOutOthers() { await getDb().auth.signOut({ scope: 'others' }); toast.success(t('set.sec.othersDone')) }

  // delete account
  const [del, setDel] = useState(false); const [typed, setTyped] = useState(''); const [delBusy, setDelBusy] = useState(false)
  async function deleteAccount() {
    setDelBusy(true)
    const r = await fetch('/api/account', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: typed }) })
    setDelBusy(false)
    if (r.ok) { await signOut(); return }
    const j = await r.json().catch(() => ({}))
    toast.error(j.error === 'owns_shared_workspace' ? t('set.del.shared') : t('common.error'))
  }

  return (
    <>
      <Section title={t('set.tab.profile')}>
        <div className="flex items-center gap-4"><Avatar name={name} src={avatar} size={64} />
          <div><input ref={file} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
            <Button onClick={() => file.current?.click()}><Camera className="size-4" />{t('set.profile.change')}</Button><p className="mt-1 text-xs text-text-3">{t('set.profile.avatar')}</p></div></div>
        <Field label={t('set.profile.name')}><Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label={t('set.profile.email')}><Input value={profile?.email ?? ''} readOnly disabled /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('set.profile.status')}><Select value={profile?.status ?? 'online'} onChange={(e) => updateProfile({ status: e.target.value })}>
            {(['online', 'away', 'dnd', 'offline'] as const).map((s) => <option key={s} value={s}>{t(`set.status.${s}`)}</option>)}</Select></Field>
          <Field label={t('set.profile.timezone')}><Select value={tz} onChange={(e) => setTz(e.target.value)}>{zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}</Select></Field>
        </div>
        <div className="flex justify-end"><Button variant="primary" loading={busy} onClick={save} disabled={!name.trim() || !dirty}>{t('common.save')}</Button></div>
        {isDemo && <p className="text-xs text-text-3">{t('common.demoBanner')}</p>}
      </Section>

      {!isDemo && (
        <>
          <Section title={t('set.sec.title')} hint={t('set.sec.hint')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('set.sec.newPwd')}><Input type="password" autoComplete="new-password" value={pwd} onChange={(e) => setPwd(e.target.value)} /></Field>
              <Field label={t('set.sec.confirmPwd')}><Input type="password" autoComplete="new-password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} /></Field>
            </div>
            <div className="flex justify-end"><Button loading={pwdBusy} disabled={!pwd} onClick={changePassword}>{t('set.sec.changePwd')}</Button></div>
            <Field label={t('set.sec.newEmail')} hint={t('set.sec.emailHint')}>
              <div className="flex gap-2"><Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /><Button loading={emailBusy} disabled={!/^\S+@\S+\.\S+$/.test(email)} onClick={changeEmail}>{t('set.sec.changeEmail')}</Button></div>
            </Field>
            <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
              <div><div className="text-sm font-medium">{t('set.sec.others')}</div><div className="text-xs text-text-3">{t('set.sec.othersHint')}</div></div>
              <Button onClick={signOutOthers}><LogOut className="size-4" />{t('set.sec.othersCta')}</Button>
            </div>
          </Section>

          <Section title={t('set.del.title')} hint={t('set.del.hint')} tone="danger">
            <div className="flex justify-end"><Button variant="danger" onClick={() => setDel(true)}>{t('set.del.cta')}</Button></div>
          </Section>
          <Dialog open={del} onClose={() => setDel(false)} title={t('set.del.title')} size="sm"
            footer={<><Button onClick={() => setDel(false)}>{t('common.cancel')}</Button><Button variant="danger" loading={delBusy} disabled={typed.trim().toLowerCase() !== (profile?.email ?? '').toLowerCase()} onClick={deleteAccount}>{t('set.del.cta')}</Button></>}>
            <Field label={t('set.del.confirm')}><Input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={profile?.email ?? ''} /></Field>
          </Dialog>
        </>
      )}
    </>
  )
}
