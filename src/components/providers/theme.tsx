'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type ThemePref = 'light' | 'dark' | 'system'
type Ctx = { pref: ThemePref; resolved: 'light' | 'dark'; setPref: (p: ThemePref) => void }
const ThemeContext = createContext<Ctx | null>(null)
const KEY = 'flow_theme'

function resolve(pref: ThemePref): 'light' | 'dark' {
  if (pref !== 'system') return pref
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>('system')
  const [resolved, setResolved] = useState<'light' | 'dark'>('dark')

  useEffect(() => {
    let stored: ThemePref = 'system'
    try {
      const v = localStorage.getItem(KEY)
      if (v === 'light' || v === 'dark' || v === 'system') stored = v
    } catch {}
    setPrefState(stored)
    setResolved(resolve(stored))
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = resolved
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#1b1c20' : '#fbfbfc')
  }, [resolved])

  useEffect(() => {
    if (pref !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const on = () => setResolved(mq.matches ? 'dark' : 'light')
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [pref])

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p)
    setResolved(resolve(p))
    try { localStorage.setItem(KEY, p) } catch {}
  }, [])

  const value = useMemo(() => ({ pref, resolved, setPref }), [pref, resolved, setPref])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}

/** Inline script: applies the theme before first paint (no flash). */
export const themeInitScript = `(function(){try{var p=localStorage.getItem('${KEY}')||'system';var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';var u=JSON.parse(localStorage.getItem('flow_ui')||'{}');if(u.accent&&u.accent!=='indigo')document.documentElement.dataset.accent=u.accent;if(u.density==='compact')document.documentElement.dataset.density='compact';if(u.reduceMotion)document.documentElement.dataset.motion='reduce'}catch(e){document.documentElement.dataset.theme='dark'}})()`
