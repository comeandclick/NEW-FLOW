'use client'

import { useRouter } from 'next/navigation'
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { dictionaries, type Key } from './dict'
import { LOCALE_COOKIE, type Locale } from './config'

type Vars = Record<string, string | number>
type Ctx = {
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: Key, vars?: Vars) => string
}

const I18nContext = createContext<Ctx | null>(null)

export function I18nProvider({ initial, children }: { initial: Locale; children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initial)
  const router = useRouter()

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`
    document.documentElement.lang = l
    router.refresh() // re-render server components (marketing pages) with the new cookie
  }, [router])

  const t = useCallback(
    (key: Key, vars?: Vars) => {
      let s: string = dictionaries[locale][key] ?? dictionaries.fr[key] ?? key
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
      return s
    },
    [locale],
  )

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>')
  return ctx
}
export const useT = () => useI18n().t
export const useLocale = () => {
  const { locale, setLocale } = useI18n()
  return [locale, setLocale] as const
}
