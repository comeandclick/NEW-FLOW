'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect } from 'react'
import { Logo } from '@/components/ui/logo'
import { getDb } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { useT } from '@/i18n/provider'

/**
 * Entry point of the system "Share" menu (manifest share_target): /app/share?title=…&text=…&url=…
 * Finds the workspace opened last and hands the share over to its Captures page, which saves it.
 */
function Share() {
  const t = useT()
  const router = useRouter()
  const params = useSearchParams()
  const { userId, loading } = useSession()

  useEffect(() => {
    if (loading) return
    if (!userId) { router.replace('/login'); return }
    const query = new URLSearchParams({ share: '1' })
    for (const key of ['url', 'text', 'title']) { const value = params.get(key); if (value) query.set(key, value.slice(0, 4000)) }
    const go = (slug: string) => router.replace(`/app/${slug}/captures?${query.toString()}`)
    let last: string | null = null
    try { last = localStorage.getItem('flow_last_ws') } catch {}
    if (last) { go(last); return }
    getDb().from('workspace_members').select('workspace:workspaces(slug)').eq('user_id', userId).limit(1).then(({ data }) => {
      const slug = ((data ?? []) as { workspace: { slug: string } | { slug: string }[] | null }[]).map((r) => (Array.isArray(r.workspace) ? r.workspace[0]?.slug : r.workspace?.slug)).find(Boolean)
      if (slug) go(slug); else router.replace('/app')
    })
  }, [loading, userId, router, params])

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4">
      <Logo size={40} className="animate-pulse" />
      <p className="text-sm text-text-2">{t('cap.share.saving')}</p>
    </div>
  )
}

export default function SharePage() {
  return <Suspense><Share /></Suspense>
}
