import type { Metadata } from 'next'
import { getT } from '@/i18n/server'
import { Container, PageIntro } from '@/components/site/blocks'
import { ContactForm } from './form'

export const metadata: Metadata = { title: 'Contact' }

export default async function Contact() {
  const { t } = await getT()
  return (
    <>
      <PageIntro kicker={t('s.nav.contact')} title={t('s.contact.title')} sub={t('s.contact.sub')} />
      <Container className="pb-24"><ContactForm /></Container>
    </>
  )
}
