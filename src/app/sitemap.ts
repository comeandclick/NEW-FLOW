import type { MetadataRoute } from 'next'
const SITE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://new-flow-dashboard.vercel.app'
export default function sitemap(): MetadataRoute.Sitemap {
  return ['', '/login', '/register', '/demo', '/legal/privacy', '/legal/terms', '/legal/notice'].map((p) => ({ url: `${SITE}${p}`, changeFrequency: 'weekly' as const, priority: p === '' ? 1 : 0.5 }))
}
