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
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  }
}
