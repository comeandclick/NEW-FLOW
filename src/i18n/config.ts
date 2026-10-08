export const LOCALES = ['fr', 'en'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'fr'
export const LOCALE_COOKIE = 'flow_locale'

export function pickLocale(value?: string | null): Locale {
  const v = (value ?? '').toLowerCase()
  if (v.startsWith('en')) return 'en'
  if (v.startsWith('fr')) return 'fr'
  return DEFAULT_LOCALE
}
