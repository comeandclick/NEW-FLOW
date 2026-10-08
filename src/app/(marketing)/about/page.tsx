import type { Metadata } from 'next'
import { getT } from '@/i18n/server'
import { Container, PageIntro } from '@/components/site/blocks'

export const metadata: Metadata = { title: 'À propos · About' }

export default async function About() {
  const { t } = await getT()
  return (
    <>
      <PageIntro kicker={t('s.nav.about')} title={t('s.about.title')} />
      <Container className="pb-24"><div className="max-w-2xl space-y-6 text-[17px] leading-relaxed text-text-2"><p>{t('s.about.p1')}</p><p>{t('s.about.p2')}</p><p>{t('s.about.p3')}</p></div></Container>
    </>
  )
}
