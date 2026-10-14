import type { Metadata } from 'next'

/** Espace client : page privée, hors de l'application, jamais indexée. */
export const metadata: Metadata = {
  title: 'Espace client',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default function ClientPortalLayout({ children }: { children: React.ReactNode }) {
  return children
}
