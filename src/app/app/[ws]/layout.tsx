'use client'
import { use, type ReactNode } from 'react'
import Link from 'next/link'
import { WorkspaceProvider } from '@/lib/hooks/use-workspace'
import { AppShell } from '@/components/shell/app-shell'
import { Logo } from '@/components/ui/logo'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/provider'

function Loading() {
  return (
    <div className="flex h-dvh items-center justify-center bg-bg">
      <Logo size={40} className="animate-pulse" />
    </div>
  )
}

function Missing() {
  const t = useT()
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-bg text-center">
      <Logo size={40} />
      <p className="text-text-2">404</p>
      <Link href="/app"><Button variant="primary">{t('common.back')}</Button></Link>
    </div>
  )
}

export default function WorkspaceLayout({ children, params }: { children: ReactNode; params: Promise<{ ws: string }> }) {
  const { ws } = use(params)
  return (
    <WorkspaceProvider slug={ws} fallback={<Loading />} notFound={<Missing />}>
      <AppShell>{children}</AppShell>
    </WorkspaceProvider>
  )
}
