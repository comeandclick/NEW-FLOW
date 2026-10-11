'use client'
import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, ChevronDown } from 'lucide-react'
import { useT } from '@/i18n/provider'
import type { Key } from '@/i18n/dict'
import { cn } from '@/lib/utils'

export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  )
}

export function Container({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return <section id={id} className={cn('mx-auto w-full max-w-[1120px] px-5', className)}>{children}</section>
}

/** Text on one side, product mock on the other; flips on alternate rows. */
export function Showcase({ kicker, title, text, bullets, flip, children }: { kicker: string; title: string; text: string; bullets: string[]; flip?: boolean; children: ReactNode }) {
  return (
    <Container className="py-16 sm:py-24">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <Reveal className={cn(flip && 'lg:order-2')}>
          <div className="text-[13px] font-medium text-accent-ink">{kicker}</div>
          <h2 className="font-display mt-3 text-[clamp(1.75rem,3.4vw,2.5rem)] leading-[1.1]">{title}</h2>
          <p className="mt-4 max-w-md leading-relaxed text-text-2">{text}</p>
          <ul className="mt-6 space-y-2.5">{bullets.map((b) => <li key={b} className="flex gap-3 text-[14px] text-text-2"><span className="mt-[9px] h-px w-3 shrink-0 bg-text-3" />{b}</li>)}</ul>
        </Reveal>
        <Reveal delay={0.08} className={cn('min-w-0', flip && 'lg:order-1')}>{children}</Reveal>
      </div>
    </Container>
  )
}

export function Faq({ keys }: { keys: [Key, Key][] }) {
  const t = useT()
  const [open, setOpen] = useState<number | null>(null)
  return (
    <div className="divide-y divide-border border-y border-border">
      {keys.map(([q, a], i) => (
        <div key={q}>
          <button className="flex w-full items-center justify-between gap-4 py-4 text-left text-[15px] font-medium" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
            {t(q)}<ChevronDown className={cn('size-4 shrink-0 text-text-3 transition-transform', open === i && 'rotate-180')} />
          </button>
          <AnimatePresence initial={false}>
            {open === i && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden"><p className="max-w-2xl pb-5 text-[14.5px] leading-relaxed text-text-2">{t(a)}</p></motion.div>}
          </AnimatePresence>
        </div>
      ))}
    </div>
  )
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="group inline-flex items-center gap-1.5 text-[14px] font-medium text-text hover:text-accent-ink">{children}<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" /></Link>
}

export function PageIntro({ title, sub, kicker }: { title: string; sub?: string; kicker?: string }) {
  return (
    <Container className="pb-10 pt-12 sm:pt-20">
      {kicker && <div className="mb-3 text-[14px] text-text-3">{kicker}</div>}
      <h1 className="font-display max-w-3xl text-[clamp(2.4rem,5.4vw,4.2rem)] leading-[1.04]">{title}</h1>
      {sub && <p className="mt-5 max-w-xl text-lg leading-relaxed text-text-2">{sub}</p>}
    </Container>
  )
}
