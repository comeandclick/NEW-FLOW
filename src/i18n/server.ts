import { cookies, headers } from 'next/headers'
import { dictionaries, type Key } from './dict'
import { LOCALE_COOKIE, pickLocale, type Locale } from './config'

export async function getLocale(): Promise<Locale> {
  const c = (await cookies()).get(LOCALE_COOKIE)?.value
  if (c) return pickLocale(c)
  return pickLocale((await headers()).get('accept-language'))
}

export async function getT() {
  const locale = await getLocale()
  return { locale, t: (key: Key) => dictionaries[locale][key] ?? key }
}
