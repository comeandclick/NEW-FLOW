'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/ui/logo'
import { getDb } from '@/lib/supabase/client'
import { useT } from '@/i18n/provider'

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const t = useT()
  const router = useRouter()
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { getDb().auth.getSession().then(({ data }) => setSignedIn(!!data.session)) }, [])
  async function accept() {
    setBusy(true)
    const { data, error } = await getDb().rpc('accept_invitation', { p_token: token }).single()
    setBusy(false)
    if (error || !data) { toast.error(t('invite.invalid')); return }
    toast.success(t('invite.done')); router.replace(`/app/${(data as any).slug}`)
  }
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm animate-slide-up rounded-2xl border border-border bg-surface p-7 text-center shadow-md">
        <Logo size={44} className="mx-auto mb-5" /><h1 className="text-xl font-semibold tracking-tight">{t('invite.title')}</h1>
        <div className="mt-6">{signedIn === false ? <Link href="/login"><Button variant="primary" className="w-full">{t('invite.login')}</Button></Link> : <Button variant="primary" className="w-full" loading={busy || signedIn === null} onClick={accept}>{t('invite.accept')}</Button>}</div>
      </div>
    </div>
  )
}
