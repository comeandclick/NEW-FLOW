import type { Metadata } from 'next'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { getT } from '@/i18n/server'
import { Button } from '@/components/ui/button'
import { Container, PageIntro, Faq } from '@/components/site/blocks'

export const metadata: Metadata = { title: 'Tarifs · Pricing' }

export default async function Pricing() {
  const { t } = await getT()
  const items = ['s.pricing.i1', 's.pricing.i2', 's.pricing.i3', 's.pricing.i4', 's.pricing.i5'] as const
  return (
    <>
      <PageIntro title={t('s.pricing.title')} sub={t('s.pricing.sub')} />
      <Container className="pb-16">
        <div className="max-w-xl rounded-2xl border border-border-strong bg-surface p-8">
          <div className="text-[13px] font-medium text-text-3">{t('s.pricing.plan')}</div>
          <div className="mt-2 flex items-baseline gap-3"><span className="text-5xl font-semibold tracking-tight">{t('s.pricing.price')}</span><span className="text-sm text-text-3">{t('s.pricing.per')}</span></div>
          <ul className="mt-6 space-y-3 border-t border-border pt-6">{items.map((k) => <li key={k} className="flex items-center gap-3 text-[14.5px]"><Check className="size-4 text-success" />{t(k)}</li>)}</ul>
          <Link href="/register" className="mt-8 block"><Button variant="primary" size="lg" className="w-full">{t('s.hero.cta')}</Button></Link>
        </div>
        <p className="mt-6 max-w-xl text-[13.5px] leading-relaxed text-text-3">{t('s.pricing.note')}</p>
      </Container>
      <Container className="pb-24"><Faq keys={[['s.faq.q1', 's.faq.a1'], ['s.faq.q3', 's.faq.a3']]} /></Container>
    </>
  )
}
