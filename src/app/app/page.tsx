'use client'
 
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { Logo } from '@/components/ui/logo'
import { getDb } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { useT } from '@/i18n/provider'
import { slugify } from '@/lib/utils'
import { importKalimat } from '@/lib/import-kalimat'

function Router() {
  const t = useT()
  const router = useRouter()
  const params = useSearchParams()
  const { userId, loading } = useSession()
  const [list, setList] = useState<{ id: string; name: string; slug: string }[] | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const forceNew = params.get('new') === '1'

  useEffect(() => {
    if (loading) return
    if (!userId) { router.replace('/login'); return }
    getDb().from('workspace_members').select('workspace:workspaces(id,name,slug)').eq('user_id', userId).then(({ data, error }) => {
      if (error) {
        // Offline (or server unreachable): go straight to the workspace opened last, its pages are cached.
        let last: string | null = null
        try { last = localStorage.getItem('flow_last_ws') } catch {}
        if (last) { router.replace(`/app/${last}`); return }
      }
      const ws = ((data ?? []) as any[]).map((r) => r.workspace).filter(Boolean)
      setList(ws)
      if (ws.length === 1 && !forceNew) router.replace(`/app/${ws[0].slug}`)
    })
  }, [loading, userId, router, forceNew])

  async function loadKalimat() {
    if (!userId) return
    setBusy(true)
    try { router.replace(`/app/${await importKalimat(userId)}`) } catch { toast.error(t('common.error')); setBusy(false) }
  }

  async function create(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    const slug = `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`
    const { data, error } = await getDb().rpc('create_workspace', { p_name: name.trim(), p_slug: slug }).single()
    setBusy(false)
    if (error || !data) { toast.error(t('common.error')); return }
    router.replace(`/app/${(data as any).slug}/bienvenue`)
  }

  if (loading || !list) return <div className="flex min-h-dvh items-center justify-center"><Logo size={40} className="animate-pulse" /></div>
  const showCreate = list.length === 0 || forceNew

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-md animate-slide-up rounded-2xl border border-border bg-surface p-7 shadow-md">
        <Logo size={36} className="mb-5" />
        {showCreate ? (
          <form onSubmit={create} className="space-y-4">
            <div><h1 className="text-xl font-semibold tracking-tight">{t('onb.title')}</h1><p className="mt-1 text-sm text-text-2">{t('onb.sub')}</p></div>
            <Field label={t('onb.name')}><Input autoFocus required value={name} onChange={(e) => setName(e.target.value)} placeholder={t('onb.placeholder')} /></Field>
            <Button type="submit" variant="primary" className="w-full" loading={busy}>{t('onb.create')}</Button>
            <Button type="button" variant="ghost" className="w-full" disabled={busy} onClick={loadKalimat}>{t('onb.kalimat')}</Button>
            {list.length > 0 && <Link href="/app" className="block text-center text-xs text-text-3 hover:text-text">{t('common.back')}</Link>}
          </form>
        ) : (
          <div className="space-y-3">
            <h1 className="text-xl font-semibold tracking-tight">{t('onb.choose')}</h1>
            <ul className="space-y-2">
              {list.map((w) => (
                <li key={w.id}><Link href={`/app/${w.slug}`} className="flex items-center gap-3 rounded-xl border border-border bg-surface-2/50 px-4 py-3 text-sm font-medium transition-colors hover:border-accent/50 hover:bg-accent-soft">{w.name}</Link></li>
              ))}
            </ul>
            <Link href="/app?new=1"><Button variant="outline" className="w-full"><Plus className="size-4" />{t('shell.createWorkspace')}</Button></Link>
          </div>
        )}
      </div>
    </div>
  )
}

export default function AppIndex() {
  return <Suspense><Router /></Suspense>
}
