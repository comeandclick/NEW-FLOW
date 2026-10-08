import type { MetadataRoute } from 'next'
const SITE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://new-flow-dashboard.vercel.app'
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', allow: ['/'], disallow: ['/app/', '/api/', '/auth/'] }], sitemap: `${SITE}/sitemap.xml` }
}
