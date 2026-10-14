'use client'
import { useState } from 'react'
import { CheckCircle2, ChevronDown, KeyRound, Laptop, ShieldCheck, Unplug, WifiOff } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Card } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { useI18n } from '@/i18n/provider'
import { studioCopy } from '@/lib/studio/copy'
import { useStudio } from '@/lib/studio/store'
import { studioApi, usePoll, type LiveDevice } from '@/lib/studio/api'

const SAMPLE = 'FLOW-7K3Q-9XM2'
const CODE_RE = /^FLOW-[A-Z0-9]{4}-[A-Z0-9]{4}$/

type Dev = { id: string; name: string; lastSeen: string | number; online?: boolean; claudeOk?: boolean | null; version?: string | null }

/** Connexion du Mac : le logiciel Atelier (il remplace Flow Studio, 14/10/2026) affiche un code de liaison, à taper ici. */
export function ConnectPanel({ live = false }: { live?: boolean }) {
  const { locale } = useI18n()
  const c = studioCopy(locale)
  const l = c.live
  const en = locale === 'en'
  const simDevices = useStudio((s) => s.devices)
  const simPair = useStudio((s) => s.pair)
  const simUnpair = useStudio((s) => s.unpair)
  const polled = usePoll(studioApi.devices, 3000, live)
  const devices: Dev[] = live ? ((polled.data?.devices ?? []) as LiveDevice[]) : simDevices
  const ua = typeof navigator === 'undefined' ? '' : `${navigator.platform} ${navigator.userAgent}`
  const plat: 'mac' | 'windows' | 'other' = /Win/i.test(ua) ? 'windows' : /Mac/i.test(ua) && !/iPhone|iPad|iPod/i.test(ua) ? 'mac' : 'other'
  const [code, setCode] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const main = devices.find((d) => d.online) ?? devices[0]

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
  const unlink = (d: Dev) => { if (!confirm(en ? 'Unlink this Mac? The software will show a new code.' : 'Dissocier ce Mac ? Le logiciel affichera un nouveau code.')) return; if (live) void studioApi.removeDevice(d.id).then(() => polled.refresh()); else simUnpair(d.id) }

  // l'Atelier est déjà installé sur le Mac d'Aymen : on explique où trouver le code
  const etapes = en
    ? ['Open Atelier on your Mac.', 'Settings → Flow → “Link to Flow”: a FLOW-XXXX-XXXX code appears.', 'Type it below. Done: videos launched here start on the Mac.']
    : ['Ouvre Atelier sur ton Mac.', 'Paramètres → Flow → « Relier à Flow » : un code FLOW-XXXX-XXXX s\'affiche.', 'Tape-le ci-dessous. C\'est fait : les vidéos lancées ici démarrent sur le Mac.']

  return (
    <div className="space-y-5">
      {/* 1. État du Mac */}
      {main ? (
        <Card className="p-5 max-md:p-4">
          <div className="flex flex-wrap items-center gap-4">
            <span className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${live && !main.online ? 'bg-surface-3 text-text-3' : 'bg-success/10 text-success'}`}>{live && !main.online ? <WifiOff className="size-6" /> : <Laptop className="size-6" />}</span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-base font-semibold text-text">{main.name}<Badge color={live && !main.online ? undefined : '#15803d'}><CheckCircle2 className="size-3" />{live ? (main.online ? l.online : l.offline) : c.connect.paired}</Badge></p>
              <p className="text-[13px] text-text-3">{c.connect.lastSeen} : {new Date(main.lastSeen).toLocaleTimeString(locale, { timeStyle: 'short' })}{live && main.claudeOk != null ? ` · ${main.claudeOk ? l.claudeOk : l.claudeNo}` : ''}{live && main.version ? ` · v${main.version}` : ''}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => unlink(main)}><Unplug className="size-3.5" />{c.connect.unlink}</Button>
            </div>
          </div>
          {devices.length > 1 && <ul className="mt-4 space-y-1.5 border-t border-border pt-3">{devices.filter((d) => d.id !== main.id).map((d) => <li key={d.id} className="flex items-center gap-2 text-[13px] text-text-2"><Laptop className="size-3.5 text-text-3" /><span className="min-w-0 flex-1 truncate">{d.name}</span><Badge color={live && !d.online ? undefined : '#15803d'}>{live ? (d.online ? l.online : l.offline) : c.connect.paired}</Badge><Button size="icon" variant="ghost" aria-label={c.connect.unlink} onClick={() => unlink(d)}><Unplug className="size-3.5" /></Button></li>)}</ul>}
        </Card>
      ) : (
        <Card className="space-y-5 p-5 max-md:p-4">
          <div className="flex items-center gap-3"><span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-surface-3 text-text-3"><Laptop className="size-6" /></span><div><p className="text-base font-semibold text-text">{en ? 'Atelier is not linked yet' : 'L\'Atelier n\'est pas encore relié'}</p><p className="text-[13px] text-text-3">{en ? 'The Mac app that makes the videos.' : 'Le logiciel du Mac qui fabrique les vidéos.'}</p></div></div>
          {plat === 'other' && <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-text-2">{en ? 'Do this from the Mac where Atelier is installed, or type the code shown on the Mac here.' : 'Le code s\'affiche sur le Mac où l\'Atelier est installé : tu peux le taper ici depuis ton téléphone.'}</p>}
          <ol className="space-y-2">{etapes.map((x, i) => <li key={x} className="flex gap-3 text-[13px] text-text-2"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-ink">{i + 1}</span><span className="pt-0.5">{x}</span></li>)}</ol>
        </Card>
      )}

      {/* 2. Code de liaison (si pas encore relié, ou pour un autre Mac) */}
      {(!main || !live) && (
        <Card className="space-y-3 p-5 max-md:p-4">
          <Field label={c.connect.codeLabel} error={err}>
            <div className="flex gap-2">
              <Input value={code} onChange={(e) => { setCode(format(e.target.value)); setErr(null) }} placeholder={c.connect.codePlaceholder}
                className="h-11 flex-1 text-center font-mono text-base tracking-[0.14em]" inputMode="text" autoCapitalize="characters" autoComplete="off" spellCheck={false}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void submit() } }} />
              <Button variant="primary" size="lg" onClick={() => void submit()} disabled={!code}><KeyRound className="size-4" />{c.connect.validate}</Button>
            </div>
          </Field>
          {!live && <button type="button" className="text-xs text-text-3 underline-offset-2 hover:text-text hover:underline" onClick={() => { setCode(SAMPLE); setErr(null) }}>{c.connect.demoCode}</button>}
          {!live && <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-text-3">{c.connect.notYet}</p>}
        </Card>
      )}


      {/* 4. Autre Mac / partage / sécurité (repliés) */}
      <Card className="divide-y divide-border">
        <details className="group p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium text-text"><span className="flex items-center gap-2"><ShieldCheck className="size-4 text-text-3" />{c.connect.securityTitle}</span><ChevronDown className="size-4 text-text-3 transition-transform group-open:rotate-180" /></summary>
          <ul className="mt-3 space-y-1.5 text-[13px] text-text-2">{[c.connect.sec1, c.connect.sec2, c.connect.sec3].map((x) => <li key={x} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-text-3" />{x}</li>)}</ul>
        </details>
      </Card>
    </div>
  )
}
