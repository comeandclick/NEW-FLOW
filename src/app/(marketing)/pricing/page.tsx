import type { Metadata } from 'next'
import { Sparkles } from 'lucide-react'
import { getT } from '@/i18n/server'
import { PricingCard } from '@/components/site/pricing-card'
import { Container, PageIntro, Faq } from '@/components/site/blocks'

export const metadata: Metadata = { title: 'Tarifs · Pricing' }

export default async function Pricing() {
  const { t } = await getT()
  const items = ['s.pricing.i1', 's.pricing.i2', 's.pricing.i3', 's.pricing.i4', 's.pricing.i5'] as const
  return (
    <>
      <PageIntro kicker={t('s.nav.pricing')} title={t('s.pricing.title')} sub={t('s.pricing.sub')} />
      <Container className="pb-16">
        <PricingCard o={{ icon: Sparkles, nom: t('s.pricing.plan'), pastille: 'Lancement', prix: t('s.pricing.price'), periode: t('s.pricing.per'), cta: t('s.hero.cta'), href: '/register', principale: true,
          pour: t('s.pricing.sub'), inclus: items.map((k) => t(k)) }} />
        <p className="mt-6 max-w-xl text-[13.5px] leading-relaxed text-text-3">{t('s.pricing.note')}</p>
      </Container>
      <Container className="pb-24"><Faq keys={[['s.faq.q1', 's.faq.a1'], ['s.faq.q3', 's.faq.a3']]} /></Container>
    </>
  )
}
