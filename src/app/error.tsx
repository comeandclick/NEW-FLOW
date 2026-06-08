'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[GlobalError]', error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-8">
      <div className="max-w-md w-full space-y-4 text-center">
        <h1 className="text-xl font-semibold text-destructive">Une erreur est survenue</h1>
        <p className="text-sm text-muted-foreground font-mono break-all">
          {error.message || 'Erreur inconnue'}
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground">ID: {error.digest}</p>
        )}
        <button
          onClick={reset}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
        >
          Réessayer
        </button>
      </div>
    </div>
  )
}
