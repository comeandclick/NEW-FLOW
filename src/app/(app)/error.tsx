'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const router = useRouter()

  useEffect(() => {
    console.error('[AppError]', error.message, error.digest)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-8">
      <div className="max-w-md w-full space-y-4 text-center">
        <h1 className="text-xl font-semibold">Erreur de chargement</h1>
        <p className="text-sm text-muted-foreground font-mono break-all">
          {error.message || 'Erreur inconnue'}
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground">Digest: {error.digest}</p>
        )}
        <div className="flex gap-2 justify-center">
          <button
            onClick={reset}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
          >
            Réessayer
          </button>
          <button
            onClick={() => router.push('/workspaces')}
            className="px-4 py-2 border rounded-md text-sm"
          >
            Espaces de travail
          </button>
        </div>
      </div>
    </div>
  )
}
