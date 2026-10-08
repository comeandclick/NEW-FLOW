'use client'
import { useEffect } from 'react'
import { Logo } from '@/components/ui/logo'
import { Button } from '@/components/ui/button'

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo size={48} />
      <h1 className="text-xl font-semibold">Something went wrong · Une erreur est survenue</h1>
      <Button variant="primary" onClick={reset}>Retry · Réessayer</Button>
    </div>
  )
}
