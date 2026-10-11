import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { getLocale } from '@/i18n/server'
import { CopyBox } from './copy-box'

export const metadata: Metadata = { title: 'Installer Flow Studio sur un Mac', robots: { index: false } }
export const dynamic = 'force-dynamic'

const T = {
  fr: {
    title: 'Installer Flow Studio sur ton Mac',
    lead: 'Flow Studio relie ton Mac à Flow : tes demandes de motion design et de sites sont réalisées par Claude Code sur ce Mac, et tu suis tout depuis Flow.',
    need: 'Ce qu\'il te faut', needList: ['Un Mac (macOS) allumé et connecté à Internet', 'Un compte Claude avec Claude Code (Pro ou Max)', 'Environ 5 minutes'],
    steps: 'Installation', s1: 'Ouvre l\'app « Terminal » sur ton Mac.', s2: 'Colle cette commande et appuie sur Entrée :', s3: 'Un code s\'affiche (FLOW-XXXX-XXXX). Entre-le sur Flow, page « Création de site » > « Connexion du Mac ».', s4: 'C\'est tout : le Mac reste relié et redémarre tout seul avec l\'ordinateur.',
    copy: 'Copier', copied: 'Copié', share: 'Partager le lien', link: 'Lien à partager (téléphone, autre ordinateur)', onPhone: 'Tu es sur téléphone ? Envoie-toi ce lien et ouvre-le sur ton Mac.',
    safe: 'Sécurité', safeList: ['Aucun mot de passe ni clé ne quitte ton Mac.', 'Le code est à usage unique et expire après 10 minutes.', 'Tu peux dissocier le Mac à tout moment depuis Flow.'],
  },
  en: {
    title: 'Install Flow Studio on your Mac',
    lead: 'Flow Studio links your Mac to Flow: your motion design and site requests are built by Claude Code on this Mac, and you follow everything from Flow.',
    need: 'What you need', needList: ['A Mac (macOS) that is on and online', 'A Claude account with Claude Code (Pro or Max)', 'About 5 minutes'],
    steps: 'Installation', s1: 'Open the "Terminal" app on your Mac.', s2: 'Paste this command and press Enter:', s3: 'A code appears (FLOW-XXXX-XXXX). Enter it on Flow, "Site builder" page > "Connect the Mac".', s4: 'That\'s it: the Mac stays linked and restarts by itself with the computer.',
    copy: 'Copy', copied: 'Copied', share: 'Share the link', link: 'Link to share (phone, another computer)', onPhone: 'On a phone? Send yourself this link and open it on your Mac.',
    safe: 'Security', safeList: ['No password or key ever leaves your Mac.', 'The code is single-use and expires after 10 minutes.', 'You can unlink the Mac at any time from Flow.'],
  },
} as const

export default async function InstallPage() {
  const h = await headers()
  const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`
  const t = T[(await getLocale()) === 'en' ? 'en' : 'fr']
  const cmd = `bash <(curl -fsSL ${origin}/studio/install.sh)`
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 text-text">
      <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
      <p className="mt-2 text-[15px] text-text-2">{t.lead}</p>

      <h2 className="mt-8 text-sm font-semibold">{t.need}</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-[14px] text-text-2">{t.needList.map((x) => <li key={x}>{x}</li>)}</ul>

      <h2 className="mt-8 text-sm font-semibold">{t.steps}</h2>
      <ol className="mt-3 space-y-4 text-[14px] text-text-2">
        <li><span className="font-medium text-text">1.</span> {t.s1}</li>
        <li><span className="font-medium text-text">2.</span> {t.s2}<div className="mt-2"><CopyBox text={cmd} label={t.copy} copied={t.copied} /></div></li>
        <li><span className="font-medium text-text">3.</span> {t.s3}</li>
        <li><span className="font-medium text-text">4.</span> {t.s4}</li>
      </ol>

      <h2 className="mt-8 text-sm font-semibold">{t.link}</h2>
      <p className="mt-1 text-[13px] text-text-3">{t.onPhone}</p>
      <div className="mt-2"><CopyBox text={`${origin}/studio/install`} label={t.copy} copied={t.copied} share={{ title: t.share, url: `${origin}/studio/install` }} /></div>

      <h2 className="mt-8 text-sm font-semibold">{t.safe}</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-[14px] text-text-2">{t.safeList.map((x) => <li key={x}>{x}</li>)}</ul>
    </main>
  )
}
