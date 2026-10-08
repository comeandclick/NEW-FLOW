import type { Metadata } from 'next'
import { getT } from '@/i18n/server'
import { Container, PageIntro, Reveal } from '@/components/site/blocks'

export const metadata: Metadata = { title: 'Sécurité · Security' }

export default async function Security() {
  const { t } = await getT()
  const n = [1, 2, 3, 4, 5, 6] as const
  return (
    <>
      <PageIntro kicker={t('s.nav.security')} title={t('s.security.title')} sub={t('s.security.sub')} />
      <Container className="pb-24">
        <div className="grid gap-x-12 gap-y-10 md:grid-cols-2">
          {n.map((i) => <Reveal key={i}><div className="border-t border-border pt-5"><h2 className="text-[15px] font-semibold">{t(`s.sec.${i}.t` as 's.sec.1.t')}</h2><p className="mt-2 max-w-md text-[14.5px] leading-relaxed text-text-2">{t(`s.sec.${i}.d` as 's.sec.1.d')}</p></div></Reveal>)}
        </div>
      </Container>
    </>
  )
}
