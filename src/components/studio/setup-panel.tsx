'use client'
import { useState } from 'react'
import { AlertTriangle, Check, CircleDashed, Download, KeyRound, Loader2, RefreshCw, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Card } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n/provider'
import { studioCopy } from '@/lib/studio/copy'
import { studioApi, type LiveDevice, type SetupComponent } from '@/lib/studio/api'
import { cn } from '@/lib/utils'

const GROUPS = ['ia', 'motion', 'outils', 'site'] as const
const COLOR: Record<SetupComponent['state'], string | undefined> = { ok: '#15803d', missing: '#c4262f', warn: '#a16207', installing: '#4d59c7', error: '#c4262f', waiting: '#4d59c7' }

function StateIcon({ s }: { s: SetupComponent['state'] }) {
  const c = 'size-3.5'
  return s === 'ok' ? <Check className={cn(c, 'text-success')} /> : s === 'installing' ? <Loader2 className={cn(c, 'animate-spin text-accent-ink')} /> : s === 'waiting' ? <CircleDashed className={cn(c, 'text-accent-ink')} /> : s === 'warn' ? <AlertTriangle className={cn(c, 'text-[#a16207]')} /> : <X className={cn(c, 'text-danger')} />
}

/** État des logiciels du Mac et installation depuis Flow : moteur de motion (EffectCraft gratuit, After Effects payant, Remotion), Claude Code, ffmpeg, skills… */
export function SetupPanel({ device, onChanged }: { device: LiveDevice; onChanged: () => void }) {
  const { locale } = useI18n()
  const cp = studioCopy(locale)
  const c = cp.setup
  const [busy, setBusy] = useState<string | null>(null)
  const st = device.setup
  const send = async (action: 'install' | 'login' | 'rescan', component?: string, choice?: string) => {
    setBusy(`${action}:${component ?? ''}`)
    try { await studioApi.setup(device.id, { action, component, choice }); toast.success(c.sent); onChanged() }
    catch (e) { toast.error((e as { code?: string }).code === 'migration_required' ? c.needMigration : 'Erreur') } finally { setBusy(null) }
  }
  const comps = st?.components ?? []
  const noEngine = comps.length > 0 && !comps.some((x) => x.group === 'motion' && x.state === 'ok')

  return (
    <Card className="space-y-4 p-5 max-md:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-text">{c.title}</h3>
          {comps.length > 0 && <div className="mt-2 flex items-center gap-3"><div className="h-1.5 w-40 max-w-full overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-label={c.title} aria-valuemin={0} aria-valuemax={comps.length} aria-valuenow={comps.filter((x) => x.state === 'ok').length}><div className="h-full rounded-full bg-success transition-[width] duration-500" style={{ width: `${(comps.filter((x) => x.state === 'ok').length / comps.length) * 100}%` }} /></div><span className="text-xs text-text-3">{comps.filter((x) => x.state === 'ok').length} / {comps.length}</span></div>}
        </div>
        <Button size="sm" variant="outline" disabled={!device.online || busy === 'rescan:'} onClick={() => void send('rescan')}><RefreshCw className="size-3.5" />{c.rescan}</Button>
      </div>
      {!device.online && <p className="rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-text-2">{c.offline}</p>}
      {device.online && !st && <p className="flex items-center gap-2 text-[13px] text-text-3"><Loader2 className="size-3.5 animate-spin" />{c.waitingScan}</p>}

      {st?.installing && (
        <div className="space-y-2 rounded-lg border border-accent/30 bg-accent-soft p-3" role="status">
          <div className="flex items-center justify-between gap-3 text-[13px]"><span className="font-medium text-text">{st.installing.label}</span><span className="text-text-2">{st.installing.pct} %</span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-label={st.installing.label} aria-valuenow={st.installing.pct} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${st.installing.pct}%` }} /></div>
          <p className="break-words text-xs text-text-2">{st.installing.step}</p>
          {st.installing.log.length > 1 && <details className="text-xs text-text-3"><summary className="cursor-pointer">{c.log}</summary><pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap font-mono text-[11px]">{st.installing.log.join('\n')}</pre></details>}
        </div>
      )}

      {noEngine && <p className="flex items-start gap-2 rounded-lg bg-[#a16207]/10 px-3 py-2 text-[13px] text-text"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#a16207]" />{c.engineHint}</p>}

      {GROUPS.map((g) => {
        const list = comps.filter((x) => x.group === g)
        if (!list.length) return null
        return (
          <div key={g}>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-3">{c.groups[g]}</h4>
            <ul className="grid gap-2 sm:grid-cols-2">
              {list.map((x) => {
                const installing = x.state === 'installing'
                const optional = x.group === 'motion' && x.state === 'missing' && comps.some((y) => y.group === 'motion' && y.state === 'ok')
                const label = x.id === 'aftereffects' ? c.guided : x.id === 'claude' && x.state === 'warn' ? c.login : x.state === 'error' ? c.retry : c.install
                return (
                  <li key={x.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border px-3 py-2.5">
                    {optional ? <CircleDashed className="size-3.5 text-text-3" /> : <StateIcon s={x.state} />}
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-2 text-[13px] font-medium text-text">{x.name}{x.version && <span className="text-xs font-normal text-text-3">{x.version}</span>}
                        {x.cost && <Badge color={x.cost === 'free' ? '#15803d' : '#a16207'}>{x.cost === 'free' ? c.free : c.paid}</Badge>}</p>
                      {x.detail && x.state !== 'ok' && <p className="break-words text-xs text-text-3">{x.detail}</p>}
                    </div>
                    <Badge color={optional ? undefined : COLOR[x.state]}>{optional ? (locale === 'en' ? 'Optional' : 'Facultatif') : c.states[x.state]}</Badge>
                    {x.state !== 'ok' && !installing && x.installable !== false && (
                      <Button size="xs" variant={x.id === 'aftereffects' || optional ? 'outline' : 'primary'} disabled={!device.online || !!st?.installing}
                        loading={busy === `${x.id === 'claude' && x.state === 'warn' ? 'login' : 'install'}:${x.id}`}
                        onClick={() => void (x.id === 'claude' && x.state === 'warn' ? send('login', 'claude') : send('install', x.id, x.group === 'motion' ? x.id : undefined))}>
                        {x.id === 'claude' && x.state === 'warn' ? <KeyRound className="size-3" /> : <Download className="size-3" />}{label}
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </Card>
  )
}
