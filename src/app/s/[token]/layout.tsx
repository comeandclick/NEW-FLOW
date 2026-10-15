import type { Metadata } from 'next'

/** Devis ou ordre de mission à signer par le client : page privée, hors de l'application, jamais indexée. */
export const metadata: Metadata = { title: 'Document à signer', robots: { index: false, follow: false }, referrer: 'no-referrer' }

export default function SignatureLayout({ children }: { children: React.ReactNode }) {
  return children
}
