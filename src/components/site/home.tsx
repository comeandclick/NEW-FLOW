'use client'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  ArrowRight, CalendarDays, Check, ChevronLeft, ChevronRight, ClipboardList, FileText, FolderOpen, MessageSquare, Target, Users, Video, Wallet,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Reveal, Container, Faq } from './blocks'
import { GlassArt, type ArtKind } from './art'
import { AppWindow, CalendarMock, CallMock, ChatMock, CrmMock, NotesMock, TasksMock } from './mocks'
import { getDb } from '@/lib/supabase/client'
import { useT } from '@/i18n/provider'
import type { Key } from '@/i18n/dict'
import { cn } from '@/lib/utils'

const Serif = ({ children }: { children: ReactNode }) => <span className="font-serif-i text-[1.08em]">{children}</span>

export function Kicker({ children }: { children: ReactNode }) { return <div className="text-[12px] font-semibold tracking-[0.16em] text-accent-ink">{children}</div> }

function Head({ kicker, children, sub, className }: { kicker: string; children: ReactNode; sub?: string; className?: string }) {
  return (
    <Reveal className={className}>
      <Kicker>{kicker}</Kicker>
      <h2 className="mt-4 max-w-3xl text-[clamp(2rem,4.6vw,3.6rem)] font-semibold leading-[1.04] tracking-[-0.035em]">{children}</h2>
      {sub && <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-text-2">{sub}</p>}
    </Reveal>
  )
}

/* ───────────── Hero ───────────── */
const DEMOS = [
  { id: 'tasks', key: 'h.demo.tasks', node: <AppWindow wide><TasksMock /></AppWindow> },
  { id: 'chat', key: 'h.demo.chat', node: <div className="mx-auto max-w-xl"><ChatMock /></div> },
  { id: 'cal', key: 'h.demo.cal', node: <CalendarMock /> },
  { id: 'notes', key: 'h.demo.notes', node: <NotesMock /> },
  { id: 'crm', key: 'h.demo.crm', node: <CrmMock /> },
] as const

export function Hero() {
  const t = useT()
  const reduce = useReducedMotion()
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (paused || reduce) return
    const id = setInterval(() => setI((x) => (x + 1) % DEMOS.length), 4800)
    return () => clearInterval(id)
  }, [paused, reduce])
  return (
    <Container className="pt-10 text-center sm:pt-16">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <Link href="/pricing" className="group inline-flex items-center gap-2 rounded-full border border-border-strong bg-surface-2/60 py-1.5 pl-3 pr-2.5 text-[13px] text-text-2 backdrop-blur transition-colors hover:text-text">
          <span className="size-1.5 rounded-full bg-success" />{t('h.tag')}<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </motion.div>
      <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.05 }}
        className="mk-grad mx-auto mt-7 max-w-4xl text-[clamp(2.7rem,7.4vw,5.6rem)] font-semibold leading-[1.02] tracking-[-0.045em]">
        {t('h.hero.a')}<br />{t('h.hero.b')} <span className="font-serif-i text-[1.08em]">{t('h.hero.c')}</span>
      </motion.h1>
      <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.15 }} className="mx-auto mt-6 max-w-xl text-[clamp(1rem,1.9vw,1.2rem)] leading-relaxed text-text-2">{t('h.hero.sub')}</motion.p>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.25 }} className="mt-9 flex flex-wrap items-center justify-center gap-3">
        <Link href="/register"><Button variant="pill" size="lg" className="h-12 px-7 text-[15px]">{t('h.hero.cta')}</Button></Link>
        <Link href="/demo"><Button variant="glass" size="lg" className="h-12 px-7 text-[15px]">{t('h.hero.cta2')}</Button></Link>
      </motion.div>
      <p className="mt-5 text-[13px] text-text-3">{t('h.hero.fine')}</p>

      <div className="relative mx-auto mt-14 max-w-[960px]" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocusCapture={() => setPaused(true)} onBlurCapture={() => setPaused(false)}>
        <div aria-hidden className="absolute -inset-x-6 -bottom-10 -top-6 -z-10 rounded-[40px] bg-[radial-gradient(60%_60%_at_50%_30%,var(--mk-glow),transparent_70%)] blur-2xl" />
        <div role="tablist" className="no-scrollbar mx-auto mb-5 flex w-fit max-w-full gap-1 overflow-x-auto rounded-full border border-border-strong bg-surface-2/70 p-1 backdrop-blur">
          {DEMOS.map((d, k) => (
            <button key={d.id} role="tab" aria-selected={i === k} onClick={() => setI(k)} className={cn('shrink-0 rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors', i === k ? 'bg-text text-bg' : 'text-text-2 hover:text-text')}>{t(d.key)}</button>
          ))}
        </div>
        <div className="relative min-h-[360px] text-left sm:min-h-[420px]">
          <AnimatePresence mode="wait">
            <motion.div key={DEMOS[i].id} initial={{ opacity: 0, y: 14, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
              {DEMOS[i].node}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </Container>
  )
}

/* ───────────── Marquee ───────────── */
const MARQUEE: [typeof Check, Key][] = [
  [Check, 'h.m.1'], [FileText, 'h.m.2'], [MessageSquare, 'h.m.3'], [Video, 'h.m.4'], [CalendarDays, 'h.m.5'], [Users, 'h.m.6'], [Wallet, 'h.m.7'], [ClipboardList, 'h.m.8'], [FolderOpen, 'h.m.9'], [Target, 'h.m.10'],
]
export function Marquee() {
  const t = useT()
  const row = (suffix: string) => MARQUEE.map(([Icon, k]) => (
    <li key={k + suffix} className="flex shrink-0 items-center gap-2.5 rounded-full border border-border bg-surface/70 px-4 py-2.5 text-[14px] text-text-2" aria-hidden={suffix === 'b' || undefined}><Icon className="size-4 text-accent-ink" />{t(k)}</li>
  ))
  return (
    <section className="py-20" aria-label={t('h.marquee')}>
      <p className="mb-6 text-center text-[12px] font-semibold tracking-[0.16em] text-text-3">{t('h.marquee')}</p>
      <div className="mk-marquee relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
        <ul className="animate-marquee flex w-max gap-3 pr-3">{row('a')}{row('b')}</ul>
      </div>
    </section>
  )
}

/* ───────────── Stats ───────────── */
export function Stats() {
  const t = useT()
  const items = [['12', 'h.stat.1', 'h.stat.1d'], ['6', 'h.stat.2', 'h.stat.2d'], ['0 €', 'h.stat.3', 'h.stat.3d']] as const
  return (
    <Container className="pb-8">
      <div className="grid gap-4 md:grid-cols-3">
        {items.map(([n, l, d], k) => (
          <Reveal key={l} delay={k * 0.06}>
            <div className="h-full rounded-3xl border border-border bg-surface/70 p-7">
              <div className="mk-stat text-[clamp(2.6rem,5vw,3.6rem)] font-semibold leading-none tracking-[-0.04em]">{n}</div>
              <div className="mt-3 text-[15px] font-medium">{t(l)}</div>
              <p className="mt-1.5 text-[14px] leading-relaxed text-text-3">{t(d)}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </Container>
  )
}

/* ───────────── Feature carousel ───────────── */
const CARDS = [
  { n: 1, node: <AppWindow wide><TasksMock /></AppWindow> }, { n: 2, node: <ChatMock /> }, { n: 3, node: <CalendarMock /> },
  { n: 4, node: <NotesMock /> }, { n: 5, node: <CrmMock /> }, { n: 6, node: <div className="mx-auto max-w-md"><CallMock /></div> },
] as const

export function FeatureCarousel() {
  const t = useT()
  const scroller = useRef<HTMLDivElement>(null)
  const go = useCallback((dir: 1 | -1) => scroller.current?.scrollBy({ left: dir * Math.min(560, (scroller.current?.clientWidth ?? 600) * 0.85), behavior: 'smooth' }), [])
  return (
    <section id="fonctionnalites" className="scroll-mt-24 py-24 sm:py-32">
      <Container>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <Head kicker={t('h.f.kicker')} sub={t('h.f.sub')}>{t('h.f.title1')}<br />{t('h.f.title2')} <Serif>{t('h.f.title3')}</Serif> {t('h.f.title4')}</Head>
          <div className="hidden gap-2 sm:flex">
            <Button variant="glass" size="icon" className="size-11" onClick={() => go(-1)} aria-label="←"><ChevronLeft className="size-5" /></Button>
            <Button variant="glass" size="icon" className="size-11" onClick={() => go(1)} aria-label="→"><ChevronRight className="size-5" /></Button>
          </div>
        </div>
      </Container>
      <div ref={scroller} className="no-scrollbar mt-12 flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth px-[max(1.25rem,calc((100vw-1080px)/2))] pb-4" tabIndex={0} aria-label={t('h.f.kicker')}>
        {CARDS.map((c) => (
          <article key={c.n} className="w-[min(86vw,520px)] shrink-0 snap-start overflow-hidden rounded-3xl border border-border bg-surface/80">
            <div className="pointer-events-none relative h-[330px] overflow-hidden bg-[radial-gradient(80%_70%_at_50%_0%,var(--art-a),transparent_75%)] p-5 pb-0" aria-hidden>
              <div className="origin-top scale-[0.96]">{c.node}</div>
              <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-surface to-transparent" />
            </div>
            <div className="p-6 pt-3">
              <div className="text-[11.5px] font-semibold tracking-[0.14em] text-accent-ink">{t(`h.c.${c.n}.tag` as Key)}</div>
              <h3 className="mt-2.5 text-[21px] font-semibold tracking-tight">{t(`h.c.${c.n}.t` as Key)}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-text-2">{t(`h.c.${c.n}.d` as Key)}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

/* ───────────── Numbered cards with glass art ───────────── */
function Numbered({ items, prefix, arts }: { items: number[]; prefix: 'h.mod' | 'h.s'; arts: ArtKind[] }) {
  const t = useT()
  return (
    <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
      {items.map((n, k) => (
        <Reveal key={n} delay={(k % 3) * 0.06}>
          <article className="h-full overflow-hidden rounded-3xl border border-border bg-surface/80 transition-colors hover:border-border-strong">
            <GlassArt kind={arts[k % arts.length]} />
            <div className="p-6">
              <div className="font-mono text-[12px] text-accent-ink">{String(n).padStart(2, '0')}</div>
              <h3 className="mt-3 text-[19px] font-semibold tracking-tight">{t(`${prefix}.${n}.t` as Key)}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-text-2">{t(`${prefix}.${n}.d` as Key)}</p>
            </div>
          </article>
        </Reveal>
      ))}
    </div>
  )
}

export function Modules() {
  const t = useT()
  return (
    <Container id="modules" className="scroll-mt-24 py-20 sm:py-28">
      <Head kicker={t('h.mod.kicker')}>{t('h.mod.title1')} <Serif>{t('h.mod.title2')}</Serif></Head>
      <Numbered items={[1, 2, 3, 4, 5, 6]} prefix="h.mod" arts={['tiles', 'orbit', 'cube', 'bars', 'arrow', 'sphere']} />
    </Container>
  )
}

export function Steps() {
  const t = useT()
  return (
    <Container id="demarrer" className="scroll-mt-24 py-20 sm:py-28">
      <Head kicker={t('h.step.kicker')} sub={t('h.step.sub')}>{t('h.step.title1')} <Serif>{t('h.step.title2')}</Serif></Head>
      <Numbered items={[1, 2, 3, 4, 5, 6]} prefix="h.s" arts={['sphere', 'orbit', 'tiles', 'cube', 'bars', 'arrow']} />
    </Container>
  )
}

/* ───────────── For you / needs ───────────── */
export function ForYou() {
  const t = useT()
  return (
    <Container className="py-20 sm:py-24">
      <div className="grid gap-5 lg:grid-cols-2">
        <Reveal><div className="h-full rounded-3xl border border-border bg-surface/80 p-8 sm:p-10">
          <Kicker>{t('h.for.kicker')}</Kicker>
          <h3 className="mt-4 text-[clamp(1.5rem,2.6vw,2rem)] font-semibold tracking-tight">{t('h.for.title1')}</h3>
          <ul className="mt-6 space-y-4">{([1, 2, 3] as const).map((n) => <li key={n} className="flex gap-3 text-[15px] leading-relaxed text-text-2"><Check className="mt-1 size-4 shrink-0 text-accent-ink" />{t(`h.for.${n}` as Key)}</li>)}</ul>
        </div></Reveal>
        <Reveal delay={0.06}><div className="h-full rounded-3xl border border-border bg-surface/80 p-8 sm:p-10">
          <Kicker>{t('h.need.title').toUpperCase()}</Kicker>
          <ul className="mt-8 space-y-4">{([1, 2, 3, 4] as const).map((n) => <li key={n} className="flex gap-3 text-[15px] leading-relaxed text-text-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-text-3" />{t(`h.need.${n}` as Key)}</li>)}</ul>
        </div></Reveal>
      </div>
    </Container>
  )
}

/* ───────────── Pricing box ───────────── */
export function PricingBox() {
  const t = useT()
  return (
    <Container id="tarif" className="scroll-mt-24 py-20 sm:py-28">
      <Head kicker={t('h.price.kicker')}>{t('h.price.title1')} <Serif>{t('h.price.title2')}</Serif></Head>
      <Reveal>
        <div className="relative mt-12 overflow-hidden rounded-[32px] border border-border-strong bg-surface/80 p-8 sm:p-12">
          <div aria-hidden className="absolute -right-24 -top-24 size-80 rounded-full bg-[radial-gradient(circle,var(--mk-glow),transparent_70%)]" />
          <div className="relative grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
            <div><div className="mk-stat text-[clamp(4rem,9vw,6.5rem)] font-semibold leading-none tracking-[-0.05em]">{t('h.price.big')}</div><p className="mt-3 text-[15px] text-text-2">{t('h.price.per')}</p></div>
            <div>
              <ul className="space-y-3.5">{([1, 2, 3, 4] as const).map((n) => <li key={n} className="flex items-center gap-3 text-[15.5px]"><span className="flex size-5 items-center justify-center rounded-full bg-accent-soft text-accent-ink"><Check className="size-3" strokeWidth={3} /></span>{t(`h.price.${n}` as Key)}</li>)}</ul>
              <Link href="/register" className="mt-8 inline-block"><Button variant="pill" size="lg" className="h-12 px-8 text-[15px]">{t('h.price.cta')}</Button></Link>
              <p className="mt-4 max-w-md text-[13px] leading-relaxed text-text-3">{t('h.price.note')}</p>
            </div>
          </div>
        </div>
      </Reveal>
    </Container>
  )
}

/* ───────────── Newsletter ───────────── */
export function Newsletter() {
  const t = useT()
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'busy' | 'ok' | 'err'>('idle')
  async function submit(e: FormEvent) {
    e.preventDefault(); setState('busy')
    const { error } = await getDb().from('subscribers').insert({ email: email.trim().toLowerCase() })
    setState(error && !/duplicate|unique/i.test(error.message) ? 'err' : 'ok')
  }
  return (
    <Container className="py-12">
      <Reveal>
        <div className="rounded-3xl border border-border bg-surface/80 p-8 text-center sm:p-12">
          <Kicker>{t('h.news.kicker')}</Kicker>
          <h2 className="mx-auto mt-4 max-w-xl text-[clamp(1.6rem,3.4vw,2.4rem)] font-semibold leading-[1.1] tracking-[-0.03em]">{t('h.news.title')}</h2>
          <p className="mx-auto mt-3 max-w-md text-[15px] text-text-2">{t('h.news.sub')}</p>
          {state === 'ok' ? <p className="mt-7 text-[15px] font-medium text-success" role="status">{t('h.news.ok')}</p> : (
            <form onSubmit={submit} className="mx-auto mt-7 flex max-w-md flex-col gap-2 sm:flex-row">
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('h.news.placeholder')} aria-label="Email" autoComplete="email" maxLength={320}
                className="h-12 flex-1 rounded-full border border-border-strong bg-surface-2/70 px-5 text-[15px] outline-none placeholder:text-text-3 focus:border-accent focus:ring-4 focus:ring-accent/15" />
              <Button type="submit" variant="pill" size="lg" className="h-12 px-6" loading={state === 'busy'}>{t('h.news.cta')}</Button>
            </form>
          )}
          {state === 'err' && <p className="mt-3 text-[13px] text-danger" role="alert">{t('h.news.err')}</p>}
        </div>
      </Reveal>
    </Container>
  )
}

/* ───────────── FAQ + final CTA ───────────── */
export function FaqSection() {
  const t = useT()
  return (
    <Container id="faq" className="scroll-mt-24 py-20 sm:py-28">
      <Head kicker={t('h.faq.kicker')}>{t('h.faq.title1')} <Serif>{t('h.faq.title2')}</Serif></Head>
      <div className="mt-12 max-w-3xl"><Faq keys={[['s.faq.q1', 's.faq.a1'], ['s.faq.q2', 's.faq.a2'], ['s.faq.q3', 's.faq.a3'], ['s.faq.q4', 's.faq.a4'], ['s.faq.q5', 's.faq.a5'], ['h.faq.q6', 'h.faq.a6']]} /></div>
    </Container>
  )
}

export function FinalCta() {
  const t = useT()
  return (
    <Container className="pb-24 pt-8 sm:pb-32">
      <Reveal>
        <div className="relative overflow-hidden rounded-[36px] border border-border-strong px-6 py-16 text-center sm:py-24">
          <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(60%_90%_at_50%_100%,var(--mk-glow),transparent_70%)]" />
          <h2 className="mk-grad mx-auto max-w-3xl text-[clamp(2.4rem,6vw,4.5rem)] font-semibold leading-[1.03] tracking-[-0.04em]">{t('h.cta.title1')} <span className="font-serif-i text-[1.08em]">{t('h.cta.title2')}</span></h2>
          <p className="mx-auto mt-5 max-w-md text-[17px] text-text-2">{t('h.cta.sub')}</p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link href="/register"><Button variant="pill" size="lg" className="h-12 px-8 text-[15px]">{t('h.cta.primary')}</Button></Link>
            <Link href="/demo"><Button variant="glass" size="lg" className="h-12 px-8 text-[15px]">{t('h.cta.secondary')}</Button></Link>
          </div>
        </div>
      </Reveal>
    </Container>
  )
}


