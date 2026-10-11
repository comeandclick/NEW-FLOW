'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Check, Loader2, LogIn, X } from 'lucide-react'
import { ApiError, studioApi } from '@/lib/studio/api'

const KEY = 'flow_pair_code'
const CODE_RE = /^FLOW-[A-Z0-9]{4}-[A-Z0-9]{4}$/

type View = 'checking' | 'login' | 'linking' | 'done' | 'error' | 'nocode'

/** Ouverte par l'installateur du Mac : le code est dans le fragment (#code=…), jamais envoyé au serveur. Relie le Mac sans rien saisir. */
export function ConnectClient() {
  const [view, setView] = useState<View>('checking')
  const [err, setErr] = useState('')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const fromHash = new URLSearchParams(window.location.hash.slice(1)).get('code')?.toUpperCase().trim() ?? ''
    let code = CODE_RE.test(fromHash) ? fromHash : ''
    try {
      if (code) localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() }))
      else { const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (saved && Date.now() - saved.at < 10 * 60_000 && CODE_RE.test(saved.code)) code = saved.code }
    } catch { /* stockage indisponible */ }
    history.replaceState(null, '', window.location.pathname) // le code ne reste pas dans l'adresse
    if (!code) { setView('nocode'); return }
    setCode(code)
    void (async () => {
      try {
        const st = await studioApi.status()
        if (st.mode === 'anon' || st.mode === 'demo') { setView('login'); return }
        setView('linking')
        const { device } = await studioApi.confirm(code)
        try { localStorage.removeItem(KEY) } catch { /* ignore */ }
        setName(device.name); setView('done')
      } catch (e) {
        const a = e as ApiError
        setErr(a.status === 404 ? 'Code expiré ou déjà utilisé. Relance l\'installateur sur le Mac pour obtenir un nouveau code.' : a.status === 429 ? 'Trop d\'essais : réessaie dans quelques minutes.' : 'Impossible de relier ce Mac pour le moment.')
        setView('error')
      }
    })()
  }, [])

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-10 text-center text-text">
      {view === 'checking' || view === 'linking' ? <><Loader2 className="mx-auto size-8 animate-spin text-accent-ink" /><p className="mt-4 text-sm text-text-2">{view === 'linking' ? 'Liaison du Mac en cours…' : 'Vérification…'}</p></> : null}
      {view === 'login' && <>
        <LogIn className="mx-auto size-8 text-accent-ink" />
        <h1 className="mt-4 text-xl font-semibold">Connecte-toi à Flow</h1>
        <p className="mt-2 text-sm text-text-2">Pour relier ton Mac, connecte-toi à ton compte Flow : le Mac est relié automatiquement ensuite.</p>
        {code && <p className="mt-3 text-xs text-text-3">Code du Mac : <span className="font-mono font-medium text-text">{code}</span></p>}
        <Link href={`/login?next=${encodeURIComponent('/studio/connect')}`} className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-accent px-5 text-[15px] font-medium text-accent-text">Se connecter</Link>
      </>}
      {view === 'done' && <>
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-success/10 text-success"><Check className="size-6" /></span>
        <h1 className="mt-4 text-xl font-semibold">Mac relié</h1>
        <p className="mt-2 text-sm text-text-2">{name ? `« ${name} » est relié à ton compte Flow.` : 'Ton Mac est relié à ton compte Flow.'} Tu peux fermer cette page : l’installateur termine tout seul.</p>
        <Link href="/app" className="mt-5 inline-flex h-11 items-center justify-center rounded-xl border border-border-strong px-5 text-[15px] font-medium">Ouvrir Flow</Link>
      </>}
      {view === 'error' && <>
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-danger/10 text-danger"><X className="size-6" /></span>
        <h1 className="mt-4 text-xl font-semibold">Liaison impossible</h1>
        <p className="mt-2 text-sm text-text-2">{err}</p>
      </>}
      {view === 'nocode' && <>
        <h1 className="text-xl font-semibold">Aucun code reçu</h1>
        <p className="mt-2 text-sm text-text-2">Cette page s’ouvre toute seule depuis l’installateur Flow Studio sur ton Mac. Télécharge-le depuis Flow : Création de site &gt; Connexion du Mac.</p>
        <Link href="/app" className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-accent px-5 text-[15px] font-medium text-accent-text">Ouvrir Flow</Link>
      </>}
    </main>
  )
}
