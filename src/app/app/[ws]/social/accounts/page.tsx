'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { ExternalLink, RefreshCw, Trash2, Wifi, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, EmptyState, PageHeader } from '@/components/ui/misc'
import { Dialog } from '@/components/ui/overlay'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useT } from '@/i18n/provider'
import { PLATFORM_COLORS, PLATFORM_LABELS, type Platform, type SocialAccount } from '@/lib/social/types'
import { cn } from '@/lib/utils'
import { PlatformIcon } from '@/components/social/platform-icon'
import Link from 'next/link'

const PLATFORMS: Platform[] = ['instagram', 'facebook', 'tiktok', 'linkedin']

function AccountsPage() {
  const t = useT()
  const router = useRouter()
  const params = useSearchParams()
  const { ws } = useWorkspace()
  const [accounts, setAccounts] = useState<SocialAccount[]>([])
  const [configured, setConfigured] = useState<Record<Platform, boolean>>({ instagram: false, facebook: false, tiktok: false, linkedin: false })
  const [loading, setLoading] = useState(true)
  const [disconnectId, setDisconnectId] = useState<string | null>(null)

  async function loadAccounts() {
    setLoading(true)
    try {
      const [accRes, cfgRes] = await Promise.all([
        fetch(`/api/social/accounts?ws=${ws.slug}`),
        fetch('/api/social/config'),
      ])
      if (accRes.ok) {
        const { accounts: list } = await accRes.json() as { accounts: SocialAccount[] }
        setAccounts(list)
      }
      if (cfgRes.ok) {
        const { configured: cfg } = await cfgRes.json() as { configured: Record<Platform, boolean> }
        setConfigured(cfg)
      }
    } catch { toast.error(t('common.error')) } finally { setLoading(false) }
  }

  useEffect(() => { void loadAccounts() }, [ws.slug])

  useEffect(() => {
    const connected = params.get('connected')
    const error = params.get('error')
    if (connected) { toast.success(`${PLATFORM_LABELS[connected as Platform] ?? connected} connecté.`); void loadAccounts() }
    if (error) toast.error(`Erreur OAuth : ${error}`)
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
  const unconfiguredPlatforms = PLATFORMS.filter((p) => !configured[p])

  function connectPlatform(platform: Platform) {
    window.location.href = `/api/social/oauth/${platform}?ws=${ws.slug}`
  }

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <PageHeader title={t('soc.accounts.title')} subtitle={t('soc.accounts.sub')} />

      <div className="grid gap-3 sm:grid-cols-2">
        {PLATFORMS.map((platform) => {
          const isConfigured = configured[platform]
          const isConnected = connectedPlatforms.has(platform)
          const platformAccounts = accounts.filter((a) => a.platform === platform)

          return (
            <Card key={platform} className={cn('p-4 transition-colors', isConnected && 'ring-1 ring-accent/30', !isConfigured && 'opacity-60')}>
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl" style={{ background: PLATFORM_COLORS[platform] + '18' }}>
                  <PlatformIcon platform={platform} className="size-5" color={isConfigured ? PLATFORM_COLORS[platform] : 'currentColor'} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-text">{PLATFORM_LABELS[platform]}</span>
                    {isConnected && <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">{t('soc.accounts.connected')}</span>}
                    {!isConfigured && <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] text-text-3">Non configuré</span>}
                  </div>
                  {platformAccounts.map((acc) => (
                    <div key={acc.id} className="mt-1 flex items-center gap-1.5 text-[13px] text-text-2">
                      {expiredIds.has(acc.id) ? <WifiOff className="size-3 text-danger-bg" /> : <Wifi className="size-3 text-success" />}
                      <span className="truncate">@{acc.username}</span>
                      {acc.followers > 0 && <span className="text-text-3">· {acc.followers.toLocaleString('fr-FR')} abonnés</span>}
                      <button onClick={() => setDisconnectId(acc.id)} className="ml-auto shrink-0 text-text-3 hover:text-danger transition-colors" aria-label={t('soc.accounts.disconnect')}><Trash2 className="size-3.5" /></button>
                    </div>
                  ))}
                  {!isConfigured && (
                    <p className="mt-1 text-[12px] text-text-3">Clés OAuth manquantes dans <code className="rounded bg-surface-3 px-1">.env.local</code></p>
                  )}
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                {isConnected && expiredIds.size > 0 && (
                  <Button size="sm" variant="outline" disabled={!isConfigured} onClick={() => connectPlatform(platform)}>
                    <RefreshCw className="size-3.5" />{t('soc.accounts.reconnect')}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant={isConnected ? 'outline' : 'primary'}
                  disabled={!isConfigured}
                  onClick={() => connectPlatform(platform)}
                >
                  <ExternalLink className="size-3.5" />
                  {isConnected ? t('soc.accounts.reconnect') : t('soc.accounts.connect')}
                </Button>
              </div>
            </Card>
          )
        })}
      </div>

      {!loading && accounts.length === 0 && (
        <Card className="mt-4">
          <EmptyState title={t('soc.accounts.empty')} hint={t('soc.accounts.emptyHint')} />
        </Card>
      )}

      {unconfiguredPlatforms.length > 0 && (
        <div className="mt-5 rounded-xl border border-border bg-surface-2/50 p-4 text-[13px]">
          <p className="font-medium text-text">Configuration OAuth requise</p>
          <p className="mt-1 text-text-3">Ajoutez ces variables dans <code className="rounded bg-surface-3 px-1 text-[12px]">.env.local</code> et sur Vercel :</p>
          <ul className="mt-2 space-y-1 font-mono text-[11px] text-text-2">
            {unconfiguredPlatforms.some((p) => p === 'instagram' || p === 'facebook') && (
              <li><code>META_APP_ID</code> + <code>META_APP_SECRET</code></li>
            )}
            {unconfiguredPlatforms.includes('tiktok') && (
              <li><code>TIKTOK_CLIENT_KEY</code> + <code>TIKTOK_CLIENT_SECRET</code></li>
            )}
            {unconfiguredPlatforms.includes('linkedin') && (
              <li><code>LINKEDIN_CLIENT_ID</code> + <code>LINKEDIN_CLIENT_SECRET</code></li>
            )}
            <li><code>SOCIAL_ENCRYPT_KEY</code> <span className="font-sans text-success">·  déjà configuré</span></li>
          </ul>
          <p className="mt-3 text-[12px] text-text-3">
            Créez vos apps sur{' '}
            <a href="https://developers.facebook.com" target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2">Meta for Developers</a>,{' '}
            <a href="https://developers.tiktok.com" target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2">TikTok</a>,{' '}
            <a href="https://developer.linkedin.com" target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2">LinkedIn</a>.
            URL de rappel : <code className="rounded bg-surface-3 px-1">{`https://new-flow-dashboard.vercel.app/api/social/oauth/{platform}/callback`}</code>
          </p>
        </div>
      )}

      <Dialog open={!!disconnectId} onClose={() => setDisconnectId(null)} title={t('soc.accounts.disconnect')}
        footer={<><Button onClick={() => setDisconnectId(null)}>{t('common.cancel')}</Button><Button variant="primary" className="bg-danger hover:bg-danger/80" onClick={disconnect}>{t('soc.accounts.disconnect')}</Button></>}>
        <p className="text-sm text-text-2">{t('soc.accounts.disconnectConfirm')}</p>
      </Dialog>
    </div>
  )
}

export default function Page() { return <Suspense><AccountsPage /></Suspense> }
