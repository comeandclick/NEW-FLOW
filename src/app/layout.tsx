import type { Metadata, Viewport } from 'next'
import { Geist_Mono, Newsreader } from 'next/font/google'
import './globals.css'
import { I18nProvider } from '@/i18n/provider'
import { getLocale } from '@/i18n/server'
import { ThemeProvider, themeInitScript } from '@/components/providers/theme'
import { Toaster } from '@/components/ui/toaster'

const serif = Newsreader({ variable: '--font-serif', subsets: ['latin'], style: ['normal', 'italic'], display: 'swap' })
const mono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'], display: 'swap' })

const SITE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://new-flow-dashboard.vercel.app'

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: 'Flow — Work, in flow.', template: '%s · Flow' },
  description:
    'Flow réunit tâches, notes, messages, appels vidéo, calendrier, CRM et IA dans un seul espace de travail rapide et gratuit. / Tasks, notes, chat, video calls, calendar, CRM and AI in one fast, free workspace.',
  applicationName: 'Flow',
  manifest: '/manifest.webmanifest',
  openGraph: { title: 'Flow — Work, in flow.', description: 'The all-in-one workspace.', type: 'website', siteName: 'Flow' },
  twitter: { card: 'summary_large_image', title: 'Flow', description: 'The all-in-one workspace.' },
  appleWebApp: { capable: true, title: 'Flow', statusBarStyle: 'black-translucent' },
  icons: { icon: [{ url: '/icon.svg', type: 'image/svg+xml' }, { url: '/icons/192', sizes: '192x192', type: 'image/png' }], apple: [{ url: '/icons/180', sizes: '180x180', type: 'image/png' }] },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#fbfbfc' }, { media: '(prefers-color-scheme: dark)', color: '#1b1c20' }],
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  return (
    <html lang={locale} data-theme="dark" data-scroll-behavior="smooth" suppressHydrationWarning className={`${mono.variable} ${serif.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <ThemeProvider>
          <I18nProvider initial={locale}>
            {children}
            <Toaster />
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
