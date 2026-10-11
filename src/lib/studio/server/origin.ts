import 'server-only'

/** Adresse publique du site, jamais prise aveuglément dans l'en-tête Host : valeur fixée par STUDIO_PUBLIC_URL / NEXT_PUBLIC_APP_URL si elle existe, sinon l'hôte de la requête s'il a une forme valide. */
export function publicOrigin(req: Request): string { return originFromHeaders(req.headers) }
export function originFromHeaders(h: Headers): string {
  const fixed = process.env.STUDIO_PUBLIC_URL || (process.env.NODE_ENV === 'production' ? process.env.NEXT_PUBLIC_APP_URL : '')
  if (fixed) { try { return new URL(fixed).origin } catch { /* ignore */ } }
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? ''
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/i.test(host)) throw new Error('bad host')
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)
  const proto = local ? (h.get('x-forwarded-proto') ?? 'http') : 'https'
  return `${proto}://${host}`
}
