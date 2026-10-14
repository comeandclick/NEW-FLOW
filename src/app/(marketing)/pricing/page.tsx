import type { Metadata } from 'next'
import { getT } from '@/i18n/server'
import { OffresPubliques } from '@/components/site/offres-publiques'
import { Container, PageIntro, Faq } from '@/components/site/blocks'

export const metadata: Metadata = { title: 'Tarifs · Pricing' }

export default async function Pricing() {
  const { t } = await getT()
  return (
    <>
      <PageIntro kicker={t('s.nav.pricing')} title={t('s.pricing.title')} sub={t('s.pricing.sub')} />
      <Container className="pb-16"><OffresPubliques comparatif /></Container>
      <Container className="pb-24"><Faq keys={[['s.faq.q1', 's.faq.a1'], ['s.faq.q3', 's.faq.a3']]} /></Container>
    </>
  )
}
