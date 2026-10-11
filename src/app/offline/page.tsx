import type { Metadata } from 'next'
import { getT } from '@/i18n/server'
import { Logo } from '@/components/ui/logo'

export const metadata: Metadata = { title: 'Hors ligne · Offline', robots: { index: false } }

/** Shown by the service worker when a page that was never opened online is requested without a connection. */
export default async function Offline() {
  const { t } = await getT()
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg px-6 text-center text-text">
      <Logo size={40} />
      <h1 className="text-xl font-semibold">{t('off.title')}</h1>
      <p className="max-w-sm text-[15px] text-text-2">{t('off.text')}</p>
      <a href="/app" className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-accent-text">{t('off.retry')}</a>
    </main>
  )
}
