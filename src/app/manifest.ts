import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Flow',
    short_name: 'Flow',
    description: 'Tasks, notes, chat, calls and more in one workspace.',
    start_url: '/app',
    scope: '/',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    id: '/app',
    orientation: 'portrait-primary',
    categories: ['productivity', 'business'],
    lang: 'fr',
    // Once Flow is installed (computer, Android), it shows up in the system "Share" menu for links and text:
    // /app/share saves the capture in the current project. iOS ignores this entry: the iPhone uses an Apple shortcut.
    share_target: { action: '/app/share', method: 'GET', params: { title: 'title', text: 'text', url: 'url' } },
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
