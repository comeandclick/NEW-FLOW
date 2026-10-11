'use client'
import { useEffect, useState } from 'react'
import { Check, Monitor, Moon, Sun } from 'lucide-react'
import { Badge, Switch } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { LanguageToggle } from '@/components/ui/toggles'
import { useTheme, type ThemePref } from '@/components/providers/theme'
import { useSession } from '@/lib/hooks/use-session'
import { usePrefs } from '@/lib/hooks/use-prefs'
import { enablePush, pushPermission } from '@/lib/push'
import { ACCENTS, NOTIF_CATEGORIES, type Accent } from '@/lib/prefs'
import { useI18n } from '@/i18n/provider'
import { cn } from '@/lib/utils'
import { Row, Section } from './section'

const SWATCH: Record<Accent, string> = { indigo: '#4d59c7', blue: '#2f6fe0', violet: '#7a4fd8', emerald: '#12805c', rose: '#d6336c', amber: '#b45f06' }

function Segmented<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: { v: T; label: string; icon?: React.ReactNode }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5">
      {items.map((it) => (
        <button key={it.v} role="radio" aria-checked={value === it.v} onClick={() => onChange(it.v)}
          className={cn('inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors', value === it.v ? 'bg-surface text-text shadow-sm' : 'text-text-3 hover:text-text')}>{it.icon}{it.label}</button>
      ))}
    </div>
  )
}

export function PreferencesTab() {
  const { t } = useI18n()
  const { isDemo } = useSession()
  const { pref, setPref } = useTheme()
  const { prefs, update } = usePrefs()
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>('default')
  useEffect(() => { setPerm(pushPermission()) }, [])
  const themes: { v: ThemePref; label: string; icon: React.ReactNode }[] = [
    { v: 'light', label: t('common.theme.light'), icon: <Sun className="size-3.5" /> }, { v: 'dark', label: t('common.theme.dark'), icon: <Moon className="size-3.5" /> }, { v: 'system', label: t('common.theme.system'), icon: <Monitor className="size-3.5" /> },
  ]

  return (
    <>
      <Section title={t('set.pref.appearance')}>
        <Row title={t('common.theme')}><Segmented label={t('common.theme')} value={pref} onChange={setPref} items={themes} /></Row>
        <Row title={t('set.pref.accent')} hint={t('set.pref.accentHint')}>
          <div role="radiogroup" aria-label={t('set.pref.accent')} className="flex gap-2">
            {ACCENTS.map((a) => (
              <button key={a} role="radio" aria-checked={prefs.accent === a} aria-label={t(`set.accent.${a}`)} title={t(`set.accent.${a}`)} onClick={() => update({ accent: a })}
                className={cn('grid size-7 place-items-center rounded-full ring-offset-2 ring-offset-surface transition', prefs.accent === a && 'ring-2 ring-text')} style={{ background: SWATCH[a] }}>
                {prefs.accent === a && <Check className="size-3.5 text-white" />}
              </button>
            ))}
          </div>
        </Row>
        <Row title={t('set.pref.density')} hint={t('set.pref.densityHint')}>
          <Segmented label={t('set.pref.density')} value={prefs.density} onChange={(v) => update({ density: v })} items={[{ v: 'comfortable', label: t('set.pref.comfortable') }, { v: 'compact', label: t('set.pref.compact') }]} />
        </Row>
        <Row title={t('set.pref.motion')} hint={t('set.pref.motionHint')}><Switch label={t('set.pref.motion')} checked={prefs.reduceMotion} onChange={(v) => update({ reduceMotion: v })} /></Row>
      </Section>

      <Section title={t('set.pref.region')}>
        <Row title={t('common.language')}><LanguageToggle size="sm" /></Row>
        <Row title={t('set.pref.weekStart')}>
          <Segmented label={t('set.pref.weekStart')} value={String(prefs.weekStart) as '0' | '1'} onChange={(v) => update({ weekStart: v === '0' ? 0 : 1 })} items={[{ v: '1', label: t('set.pref.monday') }, { v: '0', label: t('set.pref.sunday') }]} />
        </Row>
      </Section>

      <Section title={t('set.pref.notifications')} hint={t('set.pref.notificationsHint')}>
        <Row title={t('set.pref.system')} hint={t('set.pref.systemHint')}>
          {perm === 'granted' ? <Badge color="var(--success)"><Check className="size-3" />{t('set.pref.enabled')}</Badge>
            : perm === 'denied' ? <Badge color="var(--danger)">{t('set.pref.blocked')}</Badge>
            : perm === 'unsupported' ? <Badge>—</Badge>
            : <Button variant="primary" onClick={async () => setPerm(await enablePush(isDemo))}>{t('set.pref.enable')}</Button>}
        </Row>
        <Row title={t('set.pref.banner')} hint={t('set.pref.bannerHint')}><Switch label={t('set.pref.banner')} checked={prefs.notif.system} onChange={(v) => update({ notif: { system: v } })} /></Row>
        <Row title={t('set.pref.sound')}><Switch label={t('set.pref.sound')} checked={prefs.notif.sound} onChange={(v) => update({ notif: { sound: v } })} /></Row>
        <div className="space-y-3 border-t border-border pt-4">
          {NOTIF_CATEGORIES.map((c) => (
            <Row key={c} title={t(`set.notif.${c}`)} hint={t(`set.notif.${c}.hint`)}><Switch label={t(`set.notif.${c}`)} checked={prefs.notif[c]} onChange={(v) => update({ notif: { [c]: v } })} /></Row>
          ))}
        </div>
        <div className="space-y-3 border-t border-border pt-4">
          <Row title={t('set.pref.quiet')} hint={t('set.pref.quietHint')}><Switch label={t('set.pref.quiet')} checked={prefs.notif.quiet.on} onChange={(v) => update({ notif: { quiet: { on: v } } })} /></Row>
          {prefs.notif.quiet.on && (
            <div className="flex items-center gap-3 text-sm">
              <label className="flex items-center gap-2">{t('set.pref.from')}<Input type="time" className="w-28" value={prefs.notif.quiet.from} onChange={(e) => e.target.value && update({ notif: { quiet: { from: e.target.value } } })} /></label>
              <label className="flex items-center gap-2">{t('set.pref.to')}<Input type="time" className="w-28" value={prefs.notif.quiet.to} onChange={(e) => e.target.value && update({ notif: { quiet: { to: e.target.value } } })} /></label>
            </div>
          )}
        </div>
      </Section>
    </>
  )
}

export { Select }
