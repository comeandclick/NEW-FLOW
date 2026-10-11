import type { Metadata } from 'next'
import { getT } from '@/i18n/server'
import { Container, PageIntro } from '@/components/site/blocks'

export const metadata: Metadata = { title: 'Nouveautés · Changelog' }

export default async function Changelog() {
  const { t } = await getT()
  const items = ['s.change.v3.1', 's.change.v3.2', 's.change.v3.3', 's.change.v3.4', 's.change.v3.5'] as const
  return (
    <>
      <PageIntro kicker={t('s.nav.changelog')} title={t('s.change.title')} sub={t('s.change.sub')} />
      <Container className="pb-24">
        <article className="mb-12 grid gap-4 border-t border-border pt-8 md:grid-cols-[200px_1fr]">
          <div><h2 className="font-display text-xl">{t('v.log.title')}</h2><time className="text-[13px] text-text-3" dateTime="2026-10-09">2026-10-09</time></div>
          <ul className="space-y-3">{(['v.log.1', 'v.log.2', 'v.log.3', 'v.log.4', 'v.log.5', 'v.log.6'] as const).map((k) => <li key={k} className="flex gap-3 text-[14.5px] text-text-2"><span className="mt-[10px] h-px w-3 shrink-0 bg-text-3" />{t(k)}</li>)}</ul>
        </article>
        <article className="grid gap-4 border-t border-border pt-8 md:grid-cols-[200px_1fr]">
          <div><h2 className="font-display text-xl">{t('s.change.v3')}</h2><time className="text-[13px] text-text-3" dateTime="2026-10-08">2026-10-08</time></div>
          <ul className="space-y-3">{items.map((k) => <li key={k} className="flex gap-3 text-[14.5px] text-text-2"><span className="mt-[10px] h-px w-3 shrink-0 bg-text-3" />{t(k)}</li>)}</ul>
        </article>
      </Container>
    </>
  )
}
