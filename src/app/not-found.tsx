import Link from 'next/link'
import { Logo } from '@/components/ui/logo'
import { getT } from '@/i18n/server'

export default async function NotFound() {
  const { t } = await getT()
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo size={48} />
      <p className="text-6xl font-semibold tracking-tight">404</p>
      <Link href="/" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text hover:bg-accent-hover">{t('common.back')}</Link>
    </div>
  )
}
