'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { toast } from 'sonner'
import { ExternalLink, RefreshCw, Trash2, Users, Wifi, WifiOff, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, EmptyState, PageHeader } from '@/components/ui/misc'
import { Dialog, MenuItem, Menu } from '@/components/ui/overlay'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useT } from '@/i18n/provider'
import { PLATFORM_COLORS, PLATFORM_LABELS, type Platform, type SocialAccount } from '@/lib/social/types'
import { cn } from '@/lib/utils'
import { PlatformIcon } from '@/components/social/platform-icon'

const PLATFORMS: Platform[] = ['instagram', 'facebook', 'tiktok', 'linkedin']

function AccountsPage() {
  const t = useT()
  const router = useRouter()
  const params = useSearchParams()
  const { ws } = useWorkspace()
  const [accounts, setAccounts] = useState<SocialAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [disconnectId, setDisconnectId] = useState<string | null>(null)

  async function loadAccounts() {
    setLoading(true)
    try {
      const res = await fetch(`/api/social/accounts?ws=${ws.slug}`)
      if (!res.ok) throw new Error('Failed')
      const { accounts: list } = await res.json() as { accounts: SocialAccount[] }
      setAccounts(list)
    } catch { toast.error(t('common.error')) } finally { setLoading(false) }
  }

  useEffect(() => { void loadAccounts() }, [ws.slug])

  useEffect(() => {
    const connected = params.get('connected')
    const error = params.get('error')
    if (connected) { toast.success(`${PLATFORM_LABELS[connected as Platform] ?? connected} connecté.`); void loadAccounts() }
    if (error) toast.error(`Erreur : ${error}`)
    if (connected || error) router.replace(`/app/${ws.slug}/social/accounts`)
  }, [params])

  async function disconnect() {
    if (!disconnectId) return
    try {
      await fetch(`/api/social/accounts?ws=${ws.slug}&id=${disconnectId}`, { method: 'DELETE' })
      setAccounts((a) => a.filter((x) => x.id !== disconnectId))
      toast.success('Compte déconnecté.')
    } catch { toast.error(t('common.error')) } finally { setDisconnectId(null) }
  }

  const connectedPlatforms = new Set(accounts.map((a) => a.platform))
  const expiredIds = new Set(accounts.filter((a) => a.expires_at && new Date(a.expires_at) < new Date()).map((a) => a.id))

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <PageHeader
        icon={<Users className="size-4" />}
        title={t('soc.accounts.title')}
        subtitle={t('soc.accounts.sub')}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        {PLATFORMS.map((platform) => {
          const connected = connectedPlatforms.has(platform)
          const platformAccounts = accounts.filter((a) => a.platform === platform)
          return (
            <Card key={platform} className={cn('p-4 transition-colors', connected && 'ring-1 ring-accent/30')}>
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl" style={{ background: PLATFORM_COLORS[platform] + '20' }}>
                  <PlatformIcon platform={platform} className="size-5" color={PLATFORM_COLORS[platform]} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-text">{PLATFORM_LABELS[platform]}</span>
                    {connected && <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">{t('soc.accounts.connected')}</span>}
                  </div>
                  {platformAccounts.map((acc) => (
                    <div key={acc.id} className="mt-1 flex items-center gap-1.5 text-[13px] text-text-2">
                      {expiredIds.has(acc.id) ? <WifiOff className="size-3 text-danger-bg" /> : <Wifi className="size-3 text-success" />}
                      <span className="truncate">@{acc.username}</span>
                      {acc.followers > 0 && <span className="text-text-3">{t('soc.accounts.followers', { n: String(acc.followers) })}</span>}
                      <button onClick={() => setDisconnectId(acc.id)} className="ml-auto shrink-0 text-text-3 hover:text-danger transition-colors" aria-label={t('soc.accounts.disconnect')}><Trash2 className="size-3.5" /></button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                {connected && expiredIds.size > 0 && (
                  <Button size="sm" variant="outline" onClick={() => router.push(`/api/social/oauth/${platform}?ws=${ws.slug}`)}>
                    <RefreshCw className="size-3.5" />{t('soc.accounts.reconnect')}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant={connected ? 'outline' : 'primary'}
                  onClick={() => router.push(`/api/social/oauth/${platform}?ws=${ws.slug}`)}
                >
                  <ExternalLink className="size-3.5" />
                  {connected ? t('soc.accounts.reconnect') : t('soc.accounts.connect')}
                </Button>
              </div>
            </Card>
          )
        })}
      </div>

      {!loading && accounts.length === 0 && (
        <Card><EmptyState icon={<Users className="size-5" />} title={t('soc.accounts.empty')} hint={t('soc.accounts.emptyHint')} /></Card>
      )}

      <div className="mt-4 rounded-xl border border-border bg-surface-2/50 p-4 text-[13px] text-text-2">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-text-3" />
          <div>
            <p className="font-medium text-text">Variables d'environnement nécessaires</p>
            <p className="mt-1 text-text-3">Pour activer chaque réseau, configurez les variables OAuth dans votre <code className="rounded bg-surface-3 px-1 text-[12px]">.env.local</code> :</p>
            <ul className="mt-2 space-y-0.5 font-mono text-[11px]">
              <li><code>META_APP_ID</code> + <code>META_APP_SECRET</code> — Instagram et Facebook</li>
              <li><code>TIKTOK_CLIENT_KEY</code> + <code>TIKTOK_CLIENT_SECRET</code> — TikTok</li>
              <li><code>LINKEDIN_CLIENT_ID</code> + <code>LINKEDIN_CLIENT_SECRET</code> — LinkedIn</li>
              <li><code>SOCIAL_ENCRYPT_KEY</code> — clé 32 octets hex pour chiffrer les tokens</li>
              <li><code>CRON_SECRET</code> — pour déclencher le cron de publication</li>
            </ul>
          </div>
        </div>
      </div>

      <Dialog open={!!disconnectId} onClose={() => setDisconnectId(null)} title={t('soc.accounts.disconnect')}
        footer={<><Button onClick={() => setDisconnectId(null)}>{t('common.cancel')}</Button><Button variant="primary" className="bg-danger hover:bg-danger/80" onClick={disconnect}>{t('soc.accounts.disconnect')}</Button></>}>
        <p className="text-sm text-text-2">{t('soc.accounts.disconnectConfirm')}</p>
      </Dialog>
    </div>
  )
}

export default function Page() { return <Suspense><AccountsPage /></Suspense> }
