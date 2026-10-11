/** Server-side helpers shared by the API routes. */

/** Browsers always send Origin on cross-site POST/PUT/PATCH/DELETE: reject when it is not this site. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return true // same-origin GETs and non-browser clients
  try { return new URL(origin).host === (req.headers.get('x-forwarded-host') ?? req.headers.get('host')) } catch { return false }
}

const buckets = new Map<string, number[]>()
/** Best-effort sliding-window limiter (per server instance). Returns true when the caller is over the limit. */
export function rateLimited(key: string, max: number, windowMs = 60_000): boolean {
  const now = Date.now()
  const list = (buckets.get(key) ?? []).filter((t) => now - t < windowMs)
  list.push(now); buckets.set(key, list)
  if (buckets.size > 5000) for (const [k, v] of buckets) if (!v.some((t) => now - t < windowMs)) buckets.delete(k)
  return list.length > max
}
