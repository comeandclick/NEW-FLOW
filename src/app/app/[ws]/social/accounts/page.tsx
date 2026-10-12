'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { ExternalLink, RefreshCw, Trash2, Wifi, WifiOff, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, EmptyState, PageHeader } from '@/components/ui/misc'
import { Dialog } from '@/components/ui/overlay'
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
    if (error) toast.error(`Erreur OAuth : ${decodeURIComponent(error)}`)
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
  const expiredSet = new Set(accounts.filter((a) => a.expires_at && new Date(a.expires_at) < new Date()).map((a) => a.id))

  function connectPlatform(platform: Platform) {
    window.location.href = `/api/social/oauth/${platform}?ws=${ws.slug}`
  }

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      <PageHeader title={t('soc.accounts.title')} subtitle={t('soc.accounts.sub')} />

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {PLATFORMS.map((p) => <div key={p} className="h-24 animate-pulse rounded-xl bg-surface-2" />)}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {PLATFORMS.map((platform) => {
            const isConfigured = configured[platform]
            const isConnected = connectedPlatforms.has(platform)
            const platformAccounts = accounts.filter((a) => a.platform === platform)
            const color = PLATFORM_COLORS[platform]

            return (
              <Card key={platform} className={cn('p-4 transition-all', isConnected && 'ring-1 ring-accent/40')}>
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl" style={{ background: color + '18' }}>
                    <PlatformIcon platform={platform} className="size-5" color={isConfigured ? color : 'currentColor'} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-text">{PLATFORM_LABELS[platform]}</span>
                      {isConnected && (
                        <span className="flex items-center gap-1 rounded-full bg-success/12 px-2 py-0.5 text-[11px] font-medium text-success">
                          <CheckCircle2 className="size-3" />Connecté
                        </span>
                      )}
                      {!isConfigured && (
                        <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] text-text-3">Non configuré</span>
                      )}
                    </div>

                    {platformAccounts.map((acc) => (
                      <div key={acc.id} className="mt-1.5 flex items-center gap-1.5 text-[13px] text-text-2">
                        {expiredSet.has(acc.id)
                          ? <WifiOff className="size-3 shrink-0 text-danger-bg" />
                          : <Wifi className="size-3 shrink-0 text-success" />}
                        <span className="truncate">@{acc.username}</span>
                        {acc.followers > 0 && (
                          <span className="shrink-0 text-text-3">· {acc.followers.toLocaleString('fr-FR')}</span>
                        )}
                        <button
                          onClick={() => setDisconnectId(acc.id)}
                          className="ml-auto shrink-0 rounded p-0.5 text-text-3 transition-colors hover:text-danger"
                          aria-label="Déconnecter"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    ))}

                    {expiredSet.size > 0 && platformAccounts.some((a) => expiredSet.has(a.id)) && (
                      <p className="mt-1 text-[12px] text-warning">Token expiré, reconnectez.</p>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex gap-2">
                  {isConnected && (
                    <Button size="sm" variant="outline" disabled={!isConfigured} onClick={() => connectPlatform(platform)}>
                      <RefreshCw className="size-3.5" />Reconnecter
                    </Button>
                  )}
                  {!isConnected && (
                    <Button size="sm" variant="primary" disabled={!isConfigured} onClick={() => connectPlatform(platform)}>
                      <ExternalLink className="size-3.5" />{t('soc.accounts.connect')}
                    </Button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {!loading && accounts.length === 0 && (
        <div className="mt-4">
          <EmptyState title={t('soc.accounts.empty')} hint={t('soc.accounts.emptyHint')} />
        </div>
      )}

      <Dialog
        open={!!disconnectId}
        onClose={() => setDisconnectId(null)}
        title={t('soc.accounts.disconnect')}
        footer={
          <>
            <Button onClick={() => setDisconnectId(null)}>{t('common.cancel')}</Button>
            <Button variant="primary" className="bg-danger hover:bg-danger/80" onClick={disconnect}>
              {t('soc.accounts.disconnect')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-2">{t('soc.accounts.disconnectConfirm')}</p>
      </Dialog>
    </div>
  )
}

export default function Page() { return <Suspense><AccountsPage /></Suspense> }
