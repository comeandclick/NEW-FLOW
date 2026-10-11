'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { getDb } from '@/lib/supabase/client'
import { startDemo } from '@/lib/demo/runtime'
import { useT } from '@/i18n/provider'
import type { Key } from '@/i18n/dict'
import { AuthShell } from './auth-shell'

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#4285F4" d="M22.5 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.33z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.17v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.17a11 11 0 0 0 0 9.88l3.67-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.17 7.06l3.67 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  )
}

function DemoButton() {
  const t = useT()
  return (
    <Button variant="outline" className="w-full" onClick={() => { startDemo(); window.location.href = '/app/demo' }}>
      <Play className="size-3.5" />{t('auth.demo')}
    </Button>
  )
}

function Divider() {
  const t = useT()
  return (
    <div className="relative my-5 flex items-center"><span className="h-px flex-1 bg-border" /><span className="px-3 text-xs text-text-3">{t('auth.or')}</span><span className="h-px flex-1 bg-border" /></div>
  )
}

/** Page demandée avant la connexion (?next=/chemin), limitée aux chemins du site. */
function nextPath(): string {
  try { const n = new URLSearchParams(window.location.search).get('next'); return n && /^\/(?!\/)[\w\-./?=&%#]*$/.test(n) ? n : '/app' } catch { return '/app' }
}

async function google(t: (k: Key) => string) {
  const next = nextPath()
  const { error } = await getDb().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback${next === '/app' ? '' : `?next=${encodeURIComponent(next)}`}` } })
  if (error) toast.error(t('auth.err.google'))
}

export function LoginForm() {
  const t = useT()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(null)
    const { error } = await getDb().auth.signInWithPassword({ email: email.trim(), password })
    if (error) { setErr(t('auth.err.invalid')); setBusy(false); return }
    router.replace(nextPath()); router.refresh()
  }

  return (
    <AuthShell title={t('auth.login.title')} subtitle={t('auth.login.sub')}
      footer={<>{t('auth.noAccount')} <Link href="/register" className="font-medium text-accent-ink hover:underline">{t('auth.signUp')}</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('auth.email')}><Input type="email" required autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.com" /></Field>
        <Field label={t('auth.password')} error={err}>
          <Input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </Field>
        <div className="-mt-1 text-right"><Link href="/reset" className="text-xs text-text-3 hover:text-text">{t('auth.forgot')}</Link></div>
        <Button type="submit" variant="primary" className="w-full" loading={busy}>{t('auth.signIn')}</Button>
      </form>
      <Divider />
      <div className="space-y-2.5">
        <Button variant="outline" className="w-full" onClick={() => google(t)}><GoogleIcon />{t('auth.google')}</Button>
        <DemoButton />
      </div>
    </AuthShell>
  )
}

export function RegisterForm() {
  const t = useT()
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (password.length < 8) { setErr(t('auth.err.weak')); return }
    setBusy(true); setErr(null)
    const { data, error } = await getDb().auth.signUp({
      email: email.trim(), password,
      options: { data: { full_name: name.trim() }, emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) { setErr(/registered|exists/i.test(error.message) ? t('auth.err.exists') : t('auth.err.generic')); setBusy(false); return }
    if (data.session) { router.replace('/app'); router.refresh() }
    else { toast.success(t('auth.linkSent')); setBusy(false) }
  }

  return (
    <AuthShell title={t('auth.register.title')} subtitle={t('auth.register.sub')}
      footer={<>{t('auth.hasAccount')} <Link href="/login" className="font-medium text-accent-ink hover:underline">{t('auth.signIn')}</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('auth.fullName')}><Input required autoComplete="name" autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label={t('auth.email')}><Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.com" /></Field>
        <Field label={t('auth.password')} hint={t('auth.passwordMin')} error={err}>
          <Input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" variant="primary" className="w-full" loading={busy}>{t('auth.signUp')}</Button>
      </form>
      <Divider />
      <div className="space-y-2.5">
        <Button variant="outline" className="w-full" onClick={() => google(t)}><GoogleIcon />{t('auth.google')}</Button>
        <DemoButton />
      </div>
    </AuthShell>
  )
}

export function ResetForm() {
  const t = useT()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    await getDb().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/auth/callback?next=/update-password` })
    setBusy(false); setSent(true)
  }
  return (
    <AuthShell title={t('auth.reset.title')} subtitle={t('auth.reset.sub')} footer={<Link href="/login" className="font-medium text-accent-ink hover:underline">{t('auth.signIn')}</Link>}>
      {sent ? <p className="text-sm text-text-2" role="status">{t('auth.linkSent')}</p> : (
        <form onSubmit={submit} className="space-y-4">
          <Field label={t('auth.email')}><Input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Button type="submit" variant="primary" className="w-full" loading={busy}>{t('auth.sendLink')}</Button>
        </form>
      )}
    </AuthShell>
  )
}

export function UpdatePasswordForm() {
  const t = useT()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (password.length < 8) { setErr(t('auth.err.weak')); return }
    setBusy(true)
    const { error } = await getDb().auth.updateUser({ password })
    setBusy(false)
    if (error) { setErr(t('auth.err.generic')); return }
    toast.success(t('auth.passwordUpdated'))
    router.replace('/app')
  }
  return (
    <AuthShell title={t('auth.newPassword.title')} subtitle={t('auth.passwordMin')}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('auth.password')} error={err}><Input type="password" required minLength={8} autoFocus autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <Button type="submit" variant="primary" className="w-full" loading={busy}>{t('auth.updatePassword')}</Button>
      </form>
    </AuthShell>
  )
}
