'use client'
import { useState } from 'react'
import { CheckCircle2, Download, KeyRound, Laptop, ShieldCheck, Smartphone, Terminal, Unplug } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Card } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { useI18n } from '@/i18n/provider'
import { studioCopy } from '@/lib/studio/copy'
import { useStudio } from '@/lib/studio/store'
import { studioApi, usePoll, type LiveDevice } from '@/lib/studio/api'
import { CopyBox } from '@/app/studio/install/copy-box'
import { SetupPanel } from './setup-panel'

const SAMPLE = 'FLOW-7K3Q-9XM2'
const CODE_RE = /^FLOW-[A-Z0-9]{4}-[A-Z0-9]{4}$/

/** Liaison d'un Mac par code à usage unique. Aujourd'hui : visuel + simulation locale. */
type Dev = { id: string; name: string; lastSeen: string | number; online?: boolean; claudeOk?: boolean | null }
export function ConnectPanel({ live = false }: { live?: boolean }) {
  const { locale } = useI18n()
  const c = studioCopy(locale)
  const l = c.live
  const simDevices = useStudio((s) => s.devices)
  const simPair = useStudio((s) => s.pair)
  const simUnpair = useStudio((s) => s.unpair)
  const polled = usePoll(studioApi.devices, 3000, live)
  const devices: Dev[] = live ? ((polled.data?.devices ?? []) as LiveDevice[]) : simDevices
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  const ua = typeof navigator === 'undefined' ? '' : `${navigator.platform} ${navigator.userAgent}`
  const plat: 'mac' | 'windows' | 'other' = /Win/i.test(ua) ? 'windows' : /Mac/i.test(ua) && !/iPhone|iPad|iPod/i.test(ua) ? 'mac' : 'other'
  const cmd = `bash <(curl -fsSL ${origin}/studio/install.sh)`
  const [code, setCode] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const format = (v: string) => {
    const raw = v.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^FLOW/, '').slice(0, 8)
    return raw ? `FLOW-${raw.slice(0, 4)}${raw.length > 4 ? `-${raw.slice(4)}` : ''}` : ''
  }
  const submit = async () => {
    if (!CODE_RE.test(code)) { setErr(c.connect.invalid); return }
    setErr(null)
    if (!live) { const d = simPair(); setCode(''); toast.success(c.connect.paired, { description: d.name }); return }
    try { const { device } = await studioApi.confirm(code); setCode(''); toast.success(c.connect.paired, { description: device.name }); void polled.refresh() }
    catch (e) { setErr((e as { status?: number }).status === 429 ? 'Trop d\'essais, réessaie dans quelques minutes.' : c.connect.invalid) }
  }

  return (
    <div className="space-y-5">
      {live && (devices as LiveDevice[]).slice(0, 2).map((d) => <SetupPanel key={d.id} device={d} onChanged={() => void polled.refresh()} />)}
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <div className="min-w-0 space-y-5">
        <Card className="p-5 max-md:p-4">
          <h2 className="text-sm font-semibold text-text">{c.connect.title}</h2>
          <p className="mt-0.5 text-[13px] text-text-3">{c.connect.subtitle}</p>
          <ol className="mt-5 space-y-4">
            {[
              [Terminal, c.connect.step1, c.connect.step1d],
              [Smartphone, c.connect.step2, c.connect.step2d],
              [Laptop, c.connect.step3, c.connect.step3d],
            ].map(([Icon, t, d], i) => {
              const I = Icon as typeof Terminal
              return (
                <li key={i} className="flex gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-ink"><I className="size-4" /></span>
                  <span><span className="block text-[13px] font-medium text-text">{i + 1}. {t as string}</span><span className="block text-[13px] text-text-3">{d as string}</span></span>
                </li>
              )
            })}
          </ol>
        </Card>

        <Card className="space-y-3 p-5 max-md:p-4">
          <h3 className="text-sm font-semibold text-text">{l.install}</h3>
          {l.installIntro && <p className="text-[13px] text-text-3">{l.installIntro}</p>}
          {plat === 'windows' ? <p className="rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-text-2">{l.windowsSoon}</p> : <a href="/studio/Flow-Studio-Installer.dmg" download className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 text-[15px] font-medium text-accent-text shadow-sm transition-colors hover:bg-accent-hover"><Download className="size-4" />{l.downloadInstaller}</a>}
          {plat === 'other' && <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-text-2">{l.notMac}</p>}
          <ol className="list-decimal space-y-1 pl-5 text-[13px] text-text-2">{l.downloadSteps.map((x) => <li key={x}>{x}</li>)}</ol>
          <details className="text-[13px] text-text-2"><summary className="cursor-pointer select-none text-xs text-text-3">{l.terminalAdvanced}</summary><div className="mt-2"><CopyBox text={cmd} label={c.common.copy} copied={c.common.copied} /></div></details>
          <p className="pt-1 text-[13px] font-medium text-text-2">{l.installLink}</p>
          <CopyBox text={`${origin}/studio/install`} label={c.common.copy} copied={c.common.copied} share={{ title: l.installShare, url: `${origin}/studio/install` }} />
          <a href="/studio/install" target="_blank" rel="noreferrer" className="inline-block text-xs text-text-3 underline-offset-2 hover:text-text hover:underline">{l.installOpen}</a>
        </Card>

        <div className="overflow-hidden rounded-xl border border-border-strong bg-[#101114] text-[#e7e9ee] shadow-sm" aria-hidden>
          <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-2.5"><span className="size-2.5 rounded-full bg-[#ff5f57]" /><span className="size-2.5 rounded-full bg-[#febc2e]" /><span className="size-2.5 rounded-full bg-[#28c840]" /><span className="ml-3 text-xs text-white/50">Flow — MacBook Air de Aymen</span></div>
          <div className="space-y-1 px-4 py-4 font-mono text-[12.5px] leading-relaxed">
            <p className="text-white/50">$ flow connecter</p>
            <p>Flow est prêt sur ce Mac.</p>
            <p>Entre ce code sur Flow, page « Création de site » :</p>
            <p className="my-2 inline-block rounded-md bg-white/10 px-3 py-1.5 text-lg font-semibold tracking-[0.18em] text-white">{SAMPLE}</p>
            <p className="text-white/50">Expire dans 09:41 · usage unique</p>
          </div>
        </div>
      </div>

      <div className="min-w-0 space-y-5">
        <Card className="space-y-4 p-5 max-md:p-4">
          <Field label={c.connect.codeLabel} error={err}>
            <Input value={code} onChange={(e) => { setCode(format(e.target.value)); setErr(null) }} placeholder={c.connect.codePlaceholder}
              className="h-11 text-center font-mono text-base tracking-[0.14em]" inputMode="text" autoCapitalize="characters" autoComplete="off" spellCheck={false}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void submit() } }} />
          </Field>
          <Button variant="primary" size="lg" className="w-full justify-center" onClick={() => void submit()} disabled={!code}><KeyRound className="size-4" />{c.connect.validate}</Button>
          {!live && <button type="button" className="w-full text-center text-xs text-text-3 underline-offset-2 hover:text-text hover:underline" onClick={() => { setCode(SAMPLE); setErr(null) }}>{c.connect.demoCode}</button>}
          {!live && <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-text-3">{c.connect.notYet}</p>}
        </Card>

        <Card className="p-5 max-md:p-4">
          <h3 className="mb-3 text-sm font-semibold text-text">{c.connect.devices}</h3>
          {devices.length === 0 ? <p className="text-[13px] text-text-3">{c.connect.devicesEmpty}</p> : (
            <ul className="space-y-2">
              {devices.map((d) => (
                <li key={d.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-success/10 text-success"><Laptop className="size-4" /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium text-text">{d.name}</span><span className="block text-xs text-text-3">{c.connect.lastSeen} : {new Date(d.lastSeen).toLocaleTimeString(locale, { timeStyle: 'short' })}{live && d.claudeOk != null ? ` · ${d.claudeOk ? l.claudeOk : l.claudeNo}` : ''}</span></span>
                  <Badge color={live && !d.online ? undefined : '#15803d'}><CheckCircle2 className="size-3" />{live ? (d.online ? l.online : l.offline) : c.connect.paired}</Badge>
                  <Button size="icon" variant="ghost" aria-label={c.connect.unlink} onClick={() => { if (live) { void studioApi.removeDevice(d.id).then(() => polled.refresh()) } else simUnpair(d.id) }}><Unplug className="size-3.5" /></Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5 max-md:p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text"><ShieldCheck className="size-4 text-text-3" />{c.connect.securityTitle}</h3>
          <ul className="space-y-1.5 text-[13px] text-text-2">{[c.connect.sec1, c.connect.sec2, c.connect.sec3].map((x) => <li key={x} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-text-3" />{x}</li>)}</ul>
        </Card>
      </div>
    </div>
    </div>
  )
}
