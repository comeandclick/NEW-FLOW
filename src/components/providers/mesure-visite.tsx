'use client'
// Mesure de visite anonyme (14/10/2026) : une ligne par page vue (chemin, provenance), envoyée sans cookie ni identifiant.
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

export function MesureVisite() {
  const chemin = usePathname()
  useEffect(() => {
    if (!chemin || chemin.startsWith('/admin') || navigator.webdriver) return
    const corps = JSON.stringify({ chemin, provenance: document.referrer || null })
    try { if (!navigator.sendBeacon?.('/api/visite', new Blob([corps], { type: 'application/json' }))) void fetch('/api/visite', { method: 'POST', body: corps, keepalive: true, headers: { 'content-type': 'application/json' } }) } catch {}
  }, [chemin])
  return null
}
