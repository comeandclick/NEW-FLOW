'use client'
import Link from 'next/link'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Check, ChevronRight, Hash, Sparkles } from 'lucide-react'
import { PricingCard, type Offre } from './pricing-card'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/misc'
import { Reveal, Container, Faq } from './blocks'
import { AppWindow, CalendarMock, ChatMock, CrmMock, NotesMock, TasksMock } from './mocks'
import { getDb } from '@/lib/supabase/client'
import { useT } from '@/i18n/provider'
import type { Key } from '@/i18n/dict'
import { cn } from '@/lib/utils'

const H2 = ({ children, className }: { children: ReactNode; className?: string }) => (
  <h2 className={cn('font-display text-[clamp(2rem,4.4vw,3.4rem)] leading-[1.06]', className)}>{children}</h2>
)

/* ───────────── Hero ───────────── */
const DEMOS = [
  { id: 'tasks', key: 'v.hero.tab.tasks', node: <AppWindow wide><TasksMock /></AppWindow> },
  { id: 'chat', key: 'v.hero.tab.chat', node: <div className="mx-auto max-w-xl"><ChatMock /></div> },
  { id: 'cal', key: 'v.hero.tab.cal', node: <CalendarMock /> },
] as const

export function Hero() {
  const t = useT()
  const reduce = useReducedMotion()
  const [i, setI] = useState(0)
  const [auto, setAuto] = useState(true)
  useEffect(() => {
    if (!auto || reduce) return
    const id = setInterval(() => setI((x) => (x + 1) % DEMOS.length), 5200)
    return () => clearInterval(id)
  }, [auto, reduce])
  // titre et sous-titre visibles dès le premier affichage (pas de fondu) : sinon le navigateur attend le JavaScript pour les montrer
  const rise = (delay: number, fade = true) => ({ initial: reduce ? false : { opacity: fade ? 0 : 1, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] as const } })
  return (
    // d'après 21st.dev « hero-1 » (14/10/2026) : grille fine, titre en dégradé blanc → gris, grand arc lumineux sous l'aperçu
    <section id="haut" className="mk-night mk-hero-fond relative isolate overflow-hidden rounded-b-xl pb-40 pt-32 text-text sm:pb-56 sm:pt-40">
      <div aria-hidden className="mk-hero-grille pointer-events-none absolute inset-x-0 top-0 -z-10 h-[600px] opacity-80" />
      <div aria-hidden className="mk-hero-arc pointer-events-none absolute left-1/2 top-[calc(100%-110px)] -z-10 h-[500px] w-[700px] -translate-x-1/2 rounded-[100%] md:w-[1100px] lg:top-[calc(100%-170px)] lg:h-[750px] lg:w-[140%]" />

      <div className="relative mx-auto max-w-[1120px] px-5 text-center">
        <motion.div {...rise(0)}>
          <a href="#tarif" className="group mx-auto inline-flex w-fit items-center rounded-3xl border-2 border-white/5 bg-gradient-to-tr from-zinc-300/5 via-gray-400/5 to-transparent px-5 py-2 text-[13px] uppercase tracking-tight text-text-2 transition-colors hover:text-text">
            {t('v.hero.pill')}<ChevronRight className="ml-2 size-4 transition-transform duration-300 group-hover:translate-x-1" />
          </a>
        </motion.div>
        <motion.h1 {...rise(0.06, false)} className="mk-h1-grad mx-auto max-w-[980px] text-balance py-6 text-5xl font-semibold leading-none tracking-tighter sm:text-6xl md:text-7xl lg:text-[5.5rem]">
          {t('v.hero.h1a')} {t('v.hero.h1b')}
        </motion.h1>
        <motion.p {...rise(0.12, false)} className="mx-auto max-w-[640px] text-balance text-lg tracking-tight text-text-2 md:text-xl">{t('v.hero.sub')}</motion.p>
        <motion.div {...rise(0.18)} className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link href="/register" className="inline-flex h-11 items-center rounded-md bg-white px-8 text-[15px] font-medium tracking-tight text-black shadow-sm transition-colors hover:bg-white/90">{t('v.hero.cta1')}</Link>
          <Link href="/demo" className="inline-flex h-11 items-center rounded-md border border-white/10 px-6 text-[15px] font-medium tracking-tight text-text transition-colors hover:bg-white/5">{t('v.hero.cta2')}</Link>
        </motion.div>
        <p className="mt-5 text-[13px] text-text-3">{t('v.hero.fine')}</p>

        <div className="relative mx-auto mt-20 max-w-[960px] text-left sm:mt-28 [perspective:2000px]">
          <motion.span initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
            className="absolute -top-4 right-2 z-10 inline-flex items-center gap-2 rounded-full border border-border-strong bg-surface px-3.5 py-1.5 text-[13px] font-medium shadow-lg sm:right-6">
            <span className="size-2 rounded-full bg-[#4ade80]" />{t('v.hero.badge')}
          </motion.span>
          <div role="tablist" aria-label="Aperçu" className="mb-3 flex justify-center gap-1">
            {DEMOS.map((d, k) => (
              <button key={d.id} role="tab" aria-selected={i === k} onClick={() => { setI(k); setAuto(false) }}
                className={cn('relative rounded-md px-4 py-1.5 text-[13.5px] font-medium transition-colors', i === k ? 'text-text' : 'text-text-3 hover:text-text')}>
                {i === k && <motion.span layoutId="hero-tab" className="absolute inset-0 rounded-md bg-white/10" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                <span className="relative">{t(d.key)}</span>
              </button>
            ))}
          </div>
          <div className="relative min-h-[300px] sm:min-h-[400px]" onMouseEnter={() => setAuto(false)}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={DEMOS[i].id} role="tabpanel" initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, y: -6 }} transition={{ duration: 0.28 }}
                className="[&>*]:shadow-[0_40px_100px_-30px_rgba(255,255,255,0.18)]">{DEMOS[i].node}</motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ───────────── What it replaces ───────────── */
function Struck({ children, delay }: { children: ReactNode; delay: number }) {
  const reduce = useReducedMotion()
  return (
    <span className="relative inline-block whitespace-nowrap text-text-3">
      {children}
      <motion.span aria-hidden className="absolute left-0 top-[54%] h-[2px] w-full origin-left bg-accent" initial={{ scaleX: reduce ? 1 : 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.5, delay, ease: [0.65, 0, 0.35, 1] }} />
    </span>
  )
}

export function Stack() {
  const t = useT()
  return (
    <section className="border-y border-border bg-bg-subtle">
      <div className="mx-auto max-w-[1120px] px-5 py-14 sm:py-20">
        <Reveal>
          <p className="text-[15px] text-text-2">{t('v.stack.lead')}</p>
          <p className="font-display mt-4 max-w-4xl text-[clamp(1.6rem,3.4vw,2.6rem)] leading-[1.35]">
            {([1, 2, 3, 4, 5, 6] as const).map((n, k) => <span key={n}><span className="whitespace-nowrap"><Struck delay={0.12 * k}>{t(`v.stack.${n}` as Key)}</Struck>{k < 5 ? ',' : '.'}</span>{' '}</span>)}
          </p>
          <p className="mt-6 max-w-xl text-[17px] font-medium">{t('v.stack.then')}</p>
        </Reveal>
      </div>
    </section>
  )
}

/* ───────────── Feature rows ───────────── */
const ROWS = [
  { n: 1, node: <AppWindow wide><TasksMock /></AppWindow> },
  { n: 2, node: <ChatMock /> },
  { n: 3, node: <CalendarMock /> },
  { n: 4, node: <NotesMock /> },
  { n: 5, node: <CrmMock /> },
] as const

export function Features() {
  const t = useT()
  return (
    <div id="fonctionnalites" className="scroll-mt-16">
      {ROWS.map((r, idx) => (
        <Container key={r.n} className="py-14 sm:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
            <Reveal className={cn(idx % 2 === 1 && 'lg:order-2')}>
              <h2 className="font-display text-[clamp(1.7rem,3vw,2.4rem)] leading-[1.12]">{t(`v.f${r.n}.title` as Key)}</h2>
              <p className="mt-4 max-w-[460px] text-[16px] leading-relaxed text-text-2">{t(`v.f${r.n}.text` as Key)}</p>
              <ul className="mt-6 space-y-2.5 border-t border-border pt-5">
                {([1, 2, 3] as const).map((b) => <li key={b} className="flex gap-3 text-[14.5px] text-text-2"><Check className="mt-0.5 size-4 shrink-0 text-accent-ink" strokeWidth={2.2} />{t(`v.f${r.n}.b${b}` as Key)}</li>)}
              </ul>
            </Reveal>
            <Reveal delay={0.08} className={cn('min-w-0 [&>*]:shadow-[0_24px_60px_-30px_rgba(40,30,10,0.35)]', idx % 2 === 1 && 'lg:order-1')}>{r.node}</Reveal>
          </div>
        </Container>
      ))}
    </div>
  )
}

/* ───────────── Agents & API ───────────── */
export function Agents() {
  const t = useT()
  return (
    <section id="agents" className="scroll-mt-16 border-y border-border bg-[#17160f] text-[#ece9df] [color-scheme:dark]">
      <div className="mx-auto max-w-[1120px] px-5 py-16 sm:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <Reveal>
            <p className="font-mono text-[12.5px] text-[#a9a496]">/api/v1</p>
            <h2 className="font-display mt-3 text-[clamp(1.9rem,3.8vw,3rem)] leading-[1.08]">{t('v.ag.title')}</h2>
            <p className="mt-5 max-w-[500px] text-[16px] leading-relaxed text-[#bdb8a9]">{t('v.ag.text')}</p>
            <ul className="mt-7 space-y-3">
              {([1, 2, 3, 4] as const).map((b) => <li key={b} className="flex gap-3 text-[14.5px] text-[#d3cfc2]"><Check className="mt-0.5 size-4 shrink-0 text-[#a3abf2]" strokeWidth={2.2} />{t(`v.ag.b${b}` as Key)}</li>)}
            </ul>
          </Reveal>
          <Reveal delay={0.08} className="min-w-0 space-y-4">
            <pre tabIndex={0} className="overflow-x-auto rounded-lg border border-[#2f2d24] bg-[#0f0e0a] p-4 font-mono text-[12.5px] leading-[1.7] text-[#d8d4c6]" aria-label="curl"><code>
              <span className="text-[#8c8878]">$ </span>curl -X PATCH …/api/v1/tasks/3b7d158a \{'\n'}
              {'    '}-H <span className="text-[#e3c88a]">&quot;Authorization: Bearer $FLOW_API_KEY&quot;</span> \{'\n'}
              {'    '}-d <span className="text-[#e3c88a]">{`'{"status":"done"}'`}</span>
            </code></pre>
            <div className="rounded-lg border border-[#2f2d24] bg-[#1d1c15]">
              <div className="flex items-center gap-1.5 border-b border-[#2f2d24] px-4 py-2.5 text-[13px] font-semibold"><Hash className="size-3.5 text-[#8c8878]" />{t('v.ag.channel')}</div>
              <div className="space-y-3.5 p-4 text-[13px]">
                {(['v.ag.msg1', 'v.ag.msg2'] as const).map((k, n) => (
                  <div key={k} className="flex gap-2.5"><Avatar name="Claude" size={26} />
                    <div className="min-w-0"><div className="text-[11.5px] font-semibold">Claude (API) <span className="font-normal text-[#8c8878]">{n === 0 ? '10:42' : '10:58'}</span></div>
                      <p className="mt-0.5 leading-snug text-[#d3cfc2]">{t(k)}</p></div></div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

/* ───────────── Rules ───────────── */
export function Rules() {
  const t = useT()
  return (
    <Container id="regles" className="scroll-mt-16 py-16 sm:py-24">
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <Reveal><H2>{t('v.rules.title')}</H2></Reveal>
        <Reveal delay={0.06}>
          <ol className="divide-y divide-border border-y border-border">
            {([1, 2, 3, 4, 5] as const).map((n) => <li key={n} className="py-4 text-[16.5px] leading-snug">{t(`v.rules.${n}` as Key)}</li>)}
          </ol>
        </Reveal>
      </div>
    </Container>
  )
}

/* ───────────── Pricing ───────────── */
export function PricingBox() {
  const t = useT()
  const offre: Offre = { icon: Sparkles, nom: 'Flow', pastille: t('v.price.badge'), prix: t('v.price.big'), periode: t('v.price.per'), cta: t('v.price.cta'), href: '/register', principale: true,
    pour: t('v.price.text'), inclus: ([1, 2, 3, 4] as const).map((n) => t(`v.price.${n}` as Key)) }
  return (
    <Container id="tarif" className="scroll-mt-16 py-16 sm:py-24">
      <Reveal>
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_auto]">
          <div>
            <H2>{t('v.price.title')}</H2>
            <p className="mt-4 max-w-md text-[16px] leading-relaxed text-text-2">{t('v.price.text')}</p>
          </div>
          <PricingCard o={offre} className="mx-auto lg:mx-0" />
        </div>
      </Reveal>
    </Container>
  )
}

/* ───────────── FAQ ───────────── */
export function FaqSection() {
  const t = useT()
  return (
    <Container id="faq" className="scroll-mt-16 py-16 sm:py-24">
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <Reveal><H2>{t('v.faq.title')}</H2></Reveal>
        <Reveal delay={0.06}><Faq keys={[['s.faq.q1', 's.faq.a1'], ['s.faq.q2', 's.faq.a2'], ['s.faq.q3', 's.faq.a3'], ['s.faq.q4', 's.faq.a4'], ['s.faq.q5', 's.faq.a5'], ['h.faq.q6', 'h.faq.a6']]} /></Reveal>
      </div>
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
        <div className="grid items-center gap-6 border-t border-border pt-10 lg:grid-cols-[1fr_1fr]">
          <div><h2 className="font-display text-[clamp(1.4rem,2.4vw,1.9rem)] leading-tight">{t('v.news.title')}</h2><p className="mt-2 max-w-md text-[14.5px] text-text-2">{t('v.news.sub')}</p></div>
          <div>
            {state === 'ok' ? <p className="text-[15px] font-medium text-success" role="status">{t('h.news.ok')}</p> : (
              <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('h.news.placeholder')} aria-label="Email" autoComplete="email" maxLength={320}
                  className="h-11 flex-1 rounded-md border border-border-strong bg-surface px-4 text-[15px] outline-none placeholder:text-text-3 focus:border-accent focus:ring-4 focus:ring-accent/15" />
                <Button type="submit" variant="pill" size="lg" className="h-11 px-6" loading={state === 'busy'}>{t('h.news.cta')}</Button>
              </form>
            )}
            {state === 'err' && <p className="mt-2 text-[13px] text-danger" role="alert">{t('h.news.err')}</p>}
          </div>
        </div>
      </Reveal>
    </Container>
  )
}

/* ───────────── Final call ───────────── */
export function FinalCta() {
  const t = useT()
  return (
    <section className="border-t border-border bg-bg-subtle">
      <div className="mx-auto max-w-[1120px] px-5 py-20 sm:py-28">
        <Reveal>
          <h2 className="font-display max-w-3xl text-[clamp(2.2rem,5.4vw,4.2rem)] leading-[1.04]">{t('v.cta.title')}</h2>
          <p className="mt-4 max-w-md text-[17px] text-text-2">{t('v.cta.sub')}</p>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link href="/register"><Button variant="primary" size="lg" className="h-12 rounded-md px-7 text-[15px]">{t('v.cta.1')}</Button></Link>
            <Link href="/demo" className="group inline-flex items-center gap-1.5 text-[15px] font-medium underline decoration-border-strong underline-offset-[6px] transition-colors hover:decoration-text">{t('v.cta.2')}<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /></Link>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
