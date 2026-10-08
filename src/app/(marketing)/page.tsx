import Link from 'next/link'
import { Check } from 'lucide-react'
import { getT } from '@/i18n/server'
import { Button } from '@/components/ui/button'
import { Container, Faq, Reveal, Showcase, TextLink } from '@/components/site/blocks'
import { AppWindow, CalendarMock, ChatMock, CrmMock, NotesMock, TasksMock } from '@/components/site/mocks'

export default async function Home() {
  const { t } = await getT()
  const replace = ['s.replace.1', 's.replace.2', 's.replace.3', 's.replace.4', 's.replace.5', 's.replace.6'] as const
  return (
    <>
      <Container className="pb-8 pt-16 sm:pt-24">
        <h1 className="max-w-4xl text-[clamp(2.6rem,6.6vw,5.25rem)] font-semibold leading-[1.02] tracking-[-0.045em]">{t('s.hero.title')}</h1>
        <p className="mt-6 max-w-xl text-[clamp(1.05rem,2vw,1.25rem)] leading-relaxed text-text-2">{t('s.hero.sub')}</p>
        <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link href="/register"><Button variant="primary" size="lg">{t('s.hero.cta')}</Button></Link>
          <TextLink href="/demo">{t('s.hero.cta2')}</TextLink>
        </div>
        <p className="mt-4 text-[13px] text-text-3">{t('s.hero.fine')}</p>
      </Container>
      <Container className="pb-8"><Reveal><AppWindow wide><TasksMock /></AppWindow></Reveal></Container>

      <Container className="py-20 sm:py-28">
        <Reveal><h2 className="max-w-2xl text-[clamp(1.6rem,3vw,2.25rem)] font-semibold leading-[1.15] tracking-[-0.03em]">{t('s.replace.title')}</h2></Reveal>
        <ul className="mt-10 grid border-t border-border sm:grid-cols-2 lg:grid-cols-3">
          {replace.map((k) => <li key={k} className="flex items-center gap-3 border-b border-border py-4 text-[15px] sm:pr-6"><Check className="size-4 shrink-0 text-text-3" />{t(k)}</li>)}
        </ul>
      </Container>

      <Showcase kicker={t('s.f1.kicker')} title={t('s.f1.title')} text={t('s.f1.text')} bullets={[t('s.f1.b1'), t('s.f1.b2'), t('s.f1.b3')]}><AppWindow active={1}><TasksMock /></AppWindow></Showcase>
      <Showcase flip kicker={t('s.f2.kicker')} title={t('s.f2.title')} text={t('s.f2.text')} bullets={[t('s.f2.b1'), t('s.f2.b2'), t('s.f2.b3')]}><ChatMock /></Showcase>
      <Showcase kicker={t('s.f3.kicker')} title={t('s.f3.title')} text={t('s.f3.text')} bullets={[t('s.f3.b1'), t('s.f3.b2'), t('s.f3.b3')]}><CalendarMock /></Showcase>
      <Showcase flip kicker={t('s.f4.kicker')} title={t('s.f4.title')} text={t('s.f4.text')} bullets={[t('s.f4.b1'), t('s.f4.b2'), t('s.f4.b3')]}><NotesMock /></Showcase>
      <Showcase kicker={t('s.f5.kicker')} title={t('s.f5.title')} text={t('s.f5.text')} bullets={[t('s.f5.b1'), t('s.f5.b2'), t('s.f5.b3')]}><CrmMock /></Showcase>

      <Container className="py-16 sm:py-24">
        <Reveal><h2 className="text-[clamp(1.6rem,3vw,2.25rem)] font-semibold tracking-[-0.03em]">{t('s.who.title')}</h2></Reveal>
        <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-3">
          {([1, 2, 3] as const).map((n) => <div key={n} className="bg-bg p-6"><h3 className="text-[15px] font-semibold">{t(`s.who.${n}.t` as 's.who.1.t')}</h3><p className="mt-2 text-[14px] leading-relaxed text-text-2">{t(`s.who.${n}.d` as 's.who.1.d')}</p></div>)}
        </div>
      </Container>

      <Container className="py-16 sm:py-24">
        <Reveal><h2 className="text-[clamp(1.6rem,3vw,2.25rem)] font-semibold tracking-[-0.03em]">{t('s.principles.title')}</h2></Reveal>
        <div className="mt-10 grid gap-10 md:grid-cols-3">
          {([1, 2, 3] as const).map((n) => <Reveal key={n} delay={n * 0.05}><div className="border-t border-text pt-4"><h3 className="text-[15px] font-semibold">{t(`s.p.${n}.t` as 's.p.1.t')}</h3><p className="mt-2 text-[14px] leading-relaxed text-text-2">{t(`s.p.${n}.d` as 's.p.1.d')}</p></div></Reveal>)}
        </div>
      </Container>

      <Container className="py-16 sm:py-24">
        <div className="grid gap-8 rounded-2xl border border-border bg-surface p-8 sm:p-12 lg:grid-cols-[1.2fr_1fr] lg:items-end">
          <div><h2 className="text-[clamp(1.5rem,2.8vw,2.1rem)] font-semibold leading-[1.15] tracking-[-0.03em]">{t('s.sec.title')}</h2><p className="mt-4 max-w-lg leading-relaxed text-text-2">{t('s.sec.text')}</p></div>
          <div className="lg:text-right"><TextLink href="/security">{t('s.sec.link')}</TextLink></div>
        </div>
      </Container>

      <Container id="faq" className="py-16 sm:py-24">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr]"><h2 className="text-[clamp(1.6rem,3vw,2.25rem)] font-semibold tracking-[-0.03em]">{t('s.faq.title')}</h2>
          <Faq keys={[['s.faq.q1', 's.faq.a1'], ['s.faq.q2', 's.faq.a2'], ['s.faq.q3', 's.faq.a3'], ['s.faq.q4', 's.faq.a4'], ['s.faq.q5', 's.faq.a5']]} /></div>
      </Container>

      <Container className="pb-24 pt-8 sm:pb-32">
        <div className="flex flex-col items-start justify-between gap-6 border-t border-border pt-12 md:flex-row md:items-end">
          <div><h2 className="text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.05] tracking-[-0.04em]">{t('s.cta.title')}</h2><p className="mt-3 text-text-2">{t('s.cta.text')}</p></div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3"><Link href="/demo"><Button variant="primary" size="lg">{t('s.cta.primary')}</Button></Link><TextLink href="/register">{t('s.cta.secondary')}</TextLink></div>
        </div>
      </Container>
    </>
  )
}
