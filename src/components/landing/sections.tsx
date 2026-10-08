'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowRight, Bot, CalendarDays, Check, ChevronDown, CheckSquare, FileText, FolderOpen, Gauge, MessageSquare, Play, ShieldCheck, Timer, Users, Video,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/misc'
import { Wordmark } from '@/components/ui/logo'
import { useT } from '@/i18n/provider'
import type { Key } from '@/i18n/dict'
import { Reveal } from './reveal'
import { HeroMock } from './hero-mock'

export function Hero() {
  const t = useT()
  return (
    <section className="relative overflow-hidden px-4 pb-24 pt-32 sm:px-6 sm:pt-40">
      <div className="pointer-events-none absolute inset-0 -z-10" style={{ background: 'var(--glow)' }} />
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-[0.35] [background-image:linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
      <div className="mx-auto max-w-4xl text-center">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <span className="inline-flex items-center gap-2 rounded-full border border-border-strong bg-surface/70 px-3 py-1 text-xs text-text-2 backdrop-blur">
            <span className="size-1.5 animate-pulse rounded-full bg-success" />{t('hero.badge')}
          </span>
        </motion.div>
        <motion.h1 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.05 }}
          className="mt-6 text-[clamp(2.4rem,7vw,4.75rem)] font-semibold leading-[1.04] tracking-[-0.035em]">
          {t('hero.title1')}<br />
          <span className="bg-gradient-to-r from-accent via-[#a78bfa] to-[#60a5fa] bg-clip-text text-transparent">{t('hero.title2')}</span>
        </motion.h1>
        <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.15 }}
          className="mx-auto mt-6 max-w-2xl text-balance text-base leading-relaxed text-text-2 sm:text-lg">{t('hero.sub')}</motion.p>
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.25 }}
          className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/register"><Button variant="primary" size="lg" className="w-full sm:w-auto">{t('hero.cta')}<ArrowRight className="size-4" /></Button></Link>
          <Link href="/demo"><Button variant="outline" size="lg" className="w-full sm:w-auto"><Play className="size-4" />{t('hero.cta2')}</Button></Link>
        </motion.div>
        <p className="mt-4 text-xs text-text-3">{t('hero.note')}</p>
      </div>
      <div className="mt-16 sm:mt-20"><HeroMock /></div>
    </section>
  )
}

const FEATURES: { icon: typeof Bot; t: Key; d: Key; span?: string; tint: string }[] = [
  { icon: CheckSquare, t: 'feat.tasks.t', d: 'feat.tasks.d', span: 'lg:col-span-2', tint: '#7681e8' },
  { icon: MessageSquare, t: 'feat.chat.t', d: 'feat.chat.d', tint: '#4cc38a' },
  { icon: FileText, t: 'feat.notes.t', d: 'feat.notes.d', tint: '#e5a53a' },
  { icon: Video, t: 'feat.calls.t', d: 'feat.calls.d', span: 'lg:col-span-2', tint: '#f06670' },
  { icon: CalendarDays, t: 'feat.cal.t', d: 'feat.cal.d', tint: '#5fa1f5' },
  { icon: Bot, t: 'feat.ai.t', d: 'feat.ai.d', tint: '#a78bfa' },
  { icon: Users, t: 'feat.crm.t', d: 'feat.crm.d', tint: '#14b8a6' },
  { icon: Timer, t: 'feat.focus.t', d: 'feat.focus.d', tint: '#f97316' },
  { icon: FolderOpen, t: 'feat.files.t', d: 'feat.files.d', tint: '#ec4899' },
]

export function Features() {
  const t = useT()
  return (
    <section id="features" className="scroll-mt-20 px-4 py-24 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{t('feat.title')}</h2>
          <p className="mt-4 text-text-2">{t('feat.sub')}</p>
        </Reveal>
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <Reveal key={f.t} delay={(i % 4) * 0.06} className={f.span}>
              <div className="group relative h-full overflow-hidden rounded-2xl border border-border bg-surface p-6 transition-all duration-300 hover:-translate-y-1 hover:border-border-strong hover:shadow-md">
                <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-30" style={{ background: f.tint }} />
                <span className="flex size-10 items-center justify-center rounded-xl" style={{ background: `color-mix(in srgb, ${f.tint} 16%, transparent)`, color: f.tint }}><f.icon className="size-5" /></span>
                <h3 className="mt-5 text-[15px] font-semibold">{t(f.t)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-2">{t(f.d)}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

export function Speed() {
  const t = useT()
  const items = [t('speed.k1'), t('speed.k2'), t('speed.k3')]
  const keys = [['⌘', 'K'], ['C'], ['/']]
  return (
    <section className="px-4 py-24 sm:px-6">
      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
        <Reveal>
          <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent"><Gauge className="size-5" /></span>
          <h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">{t('speed.title')}</h2>
          <p className="mt-4 max-w-md text-text-2">{t('speed.sub')}</p>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="overflow-hidden rounded-2xl border border-border-strong bg-surface shadow-lg">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm text-text-3"><Kbd>⌘</Kbd><Kbd>K</Kbd><span className="ml-1">{t('speed.k1')}…</span></div>
            <div className="p-2">
              {items.map((label, i) => (
                <div key={label} className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm ${i === 0 ? 'bg-accent-soft text-accent' : 'text-text-2'}`}>
                  <span>{label}</span><span className="flex gap-1">{keys[i].map((k) => <Kbd key={k}>{k}</Kbd>)}</span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

export function Security() {
  const t = useT()
  const list: Key[] = ['sec.i1', 'sec.i2', 'sec.i3', 'sec.i4']
  return (
    <section id="security" className="scroll-mt-20 px-4 py-24 sm:px-6">
      <Reveal className="mx-auto max-w-6xl overflow-hidden rounded-3xl border border-border bg-surface p-8 sm:p-14">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <span className="flex size-10 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--success)_16%,transparent)] text-success"><ShieldCheck className="size-5" /></span>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">{t('sec.title')}</h2>
            <p className="mt-4 max-w-md text-text-2">{t('sec.sub')}</p>
          </div>
          <ul className="space-y-3">
            {list.map((k) => (
              <li key={k} className="flex items-center gap-3 rounded-xl border border-border bg-surface-2/50 px-4 py-3 text-sm">
                <span className="flex size-5 items-center justify-center rounded-full bg-success/15 text-success"><Check className="size-3" /></span>{t(k)}
              </li>
            ))}
          </ul>
        </div>
      </Reveal>
    </section>
  )
}

export function Faq() {
  const t = useT()
  const [open, setOpen] = useState<number | null>(0)
  const qs = [1, 2, 3, 4, 5] as const
  return (
    <section id="faq" className="scroll-mt-20 px-4 py-24 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <Reveal><h2 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">{t('faq.title')}</h2></Reveal>
        <div className="mt-12 divide-y divide-border rounded-2xl border border-border bg-surface">
          {qs.map((n, i) => (
            <div key={n}>
              <button className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-[15px] font-medium" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
                {t(`faq.q${n}` as Key)}
                <ChevronDown className={`size-4 shrink-0 text-text-3 transition-transform ${open === i ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence initial={false}>
                {open === i && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
                    <p className="px-5 pb-5 text-sm leading-relaxed text-text-2">{t(`faq.a${n}` as Key)}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function FinalCta() {
  const t = useT()
  return (
    <section className="px-4 pb-24 sm:px-6">
      <Reveal className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl border border-border-strong px-6 py-16 text-center sm:py-24">
        <div className="pointer-events-none absolute inset-0 -z-10 opacity-90" style={{ background: 'var(--glow)' }} />
        <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-5xl">{t('cta.title')}</h2>
        <p className="mx-auto mt-4 max-w-md text-text-2">{t('cta.sub')}</p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/register"><Button variant="primary" size="lg">{t('hero.cta')}<ArrowRight className="size-4" /></Button></Link>
          <Link href="/demo"><Button variant="outline" size="lg">{t('nav.demo')}</Button></Link>
        </div>
      </Reveal>
    </section>
  )
}

export function Footer() {
  const t = useT()
  return (
    <footer className="border-t border-border px-4 py-12 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 sm:flex-row sm:justify-between">
        <div><Wordmark /><p className="mt-3 text-sm text-text-3">{t('footer.tagline')}</p></div>
        <div className="flex gap-16 text-sm">
          <div className="space-y-2"><div className="font-medium">{t('footer.product')}</div>
            <a href="#features" className="block text-text-3 hover:text-text">{t('nav.features')}</a>
            <Link href="/demo" className="block text-text-3 hover:text-text">{t('nav.demo')}</Link>
            <Link href="/login" className="block text-text-3 hover:text-text">{t('nav.login')}</Link></div>
          <div className="space-y-2"><div className="font-medium">{t('footer.legal')}</div>
            <Link href="/legal/privacy" className="block text-text-3 hover:text-text">{t('footer.privacy')}</Link>
            <Link href="/legal/terms" className="block text-text-3 hover:text-text">{t('footer.terms')}</Link>
            <Link href="/legal/notice" className="block text-text-3 hover:text-text">{t('footer.legalNotice')}</Link></div>
        </div>
      </div>
      <p className="mx-auto mt-10 max-w-6xl text-xs text-text-3">© {new Date().getFullYear()} Flow. {t('footer.rights')}</p>
    </footer>
  )
}

export function CookieNotice() {
  const t = useT()
  const [hidden, setHidden] = useState(true)
  useEffect(() => {
    try { if (!localStorage.getItem('flow_cookie_ok')) setHidden(false) } catch { setHidden(false) }
  }, [])
  if (hidden) return null
  return (
    <div className="fixed inset-x-3 bottom-3 z-[60] mx-auto flex max-w-xl animate-slide-up items-center gap-3 rounded-xl border border-border-strong bg-surface p-3 pl-4 shadow-lg safe-bottom">
      <p className="flex-1 text-xs text-text-2">{t('cookies.text')}</p>
      <Button size="sm" variant="primary" onClick={() => { try { localStorage.setItem('flow_cookie_ok', '1') } catch {} setHidden(true) }}>{t('cookies.ok')}</Button>
    </div>
  )
}
