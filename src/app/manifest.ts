import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Flow',
    short_name: 'Flow',
    description: 'Tasks, notes, chat, calls and more in one workspace.',
    start_url: '/app',
    scope: '/',
    display: 'standalone',
    background_color: '#08090a',
    theme_color: '#08090a',
    id: '/app',
    orientation: 'portrait-primary',
    categories: ['productivity', 'business'],
    lang: 'fr',
    icons: [
      { src: '/icons/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/512?maskable=1', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  }
}
