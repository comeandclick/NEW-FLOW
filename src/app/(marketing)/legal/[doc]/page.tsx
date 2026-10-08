import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { Wordmark } from '@/components/ui/logo'
import { getLocale } from '@/i18n/server'

const DOCS = {
  privacy: {
    fr: { title: 'Politique de confidentialité', body: [
      ['Données collectées', 'Flow collecte uniquement les informations nécessaires au service : adresse e-mail, nom, contenu que vous créez (tâches, notes, messages, fichiers) et préférences d’affichage.'],
      ['Utilisation', 'Vos données servent exclusivement à faire fonctionner Flow. Elles ne sont ni vendues ni utilisées à des fins publicitaires.'],
      ['Hébergement et sécurité', 'Les données sont stockées dans une base PostgreSQL hébergée en Europe, avec un contrôle d’accès par espace de travail (Row Level Security) et un chiffrement en transit.'],
      ['Cookies', 'Seuls des cookies essentiels sont utilisés : session d’authentification, langue et thème. Aucun traceur publicitaire.'],
      ['Vos droits', 'Vous pouvez exporter l’intégralité de vos données depuis Paramètres › Espace, modifier votre profil ou supprimer votre espace à tout moment. Pour toute demande, contactez-nous.'],
    ] },
    en: { title: 'Privacy policy', body: [
      ['Data we collect', 'Flow only collects what the service needs: email address, name, content you create (tasks, notes, messages, files) and display preferences.'],
      ['How we use it', 'Your data is used solely to run Flow. It is never sold or used for advertising.'],
      ['Hosting and security', 'Data is stored in a PostgreSQL database hosted in Europe, with per-workspace access control (Row Level Security) and encryption in transit.'],
      ['Cookies', 'Only essential cookies are used: authentication session, language and theme. No advertising trackers.'],
      ['Your rights', 'You can export all your data from Settings › Workspace, edit your profile or delete your workspace at any time. Contact us for any request.'],
    ] },
  },
  terms: {
    fr: { title: 'Conditions d’utilisation', body: [
      ['Service', 'Flow est fourni « tel quel » pendant sa phase de lancement. Nous nous efforçons d’assurer une disponibilité maximale sans pouvoir la garantir.'],
      ['Votre compte', 'Vous êtes responsable de la confidentialité de vos identifiants et du contenu que vous publiez dans vos espaces.'],
      ['Usage acceptable', 'Il est interdit d’utiliser Flow pour des contenus illégaux, du spam ou pour porter atteinte à la sécurité du service.'],
      ['Résiliation', 'Vous pouvez supprimer votre espace à tout moment. Nous pouvons suspendre un compte en cas d’abus.'],
    ] },
    en: { title: 'Terms of use', body: [
      ['Service', 'Flow is provided “as is” during its launch phase. We aim for maximum availability but cannot guarantee it.'],
      ['Your account', 'You are responsible for keeping your credentials confidential and for the content you publish in your workspaces.'],
      ['Acceptable use', 'You may not use Flow for illegal content, spam, or to compromise the security of the service.'],
      ['Termination', 'You can delete your workspace at any time. We may suspend an account in case of abuse.'],
    ] },
  },
  notice: {
    fr: { title: 'Mentions légales', body: [
      ['Éditeur', 'Flow — projet édité par son équipe fondatrice. Coordonnées de contact : contact@flow.app.'],
      ['Hébergement', 'Application hébergée sur Vercel Inc. ; données stockées sur Supabase (région Europe).'],
      ['Propriété intellectuelle', 'Le logo, le design et le code de Flow sont protégés. Le contenu de vos espaces reste votre propriété.'],
    ] },
    en: { title: 'Legal notice', body: [
      ['Publisher', 'Flow — published by its founding team. Contact: contact@flow.app.'],
      ['Hosting', 'Application hosted on Vercel Inc.; data stored on Supabase (Europe region).'],
      ['Intellectual property', 'The Flow logo, design and code are protected. The content of your workspaces remains your property.'],
    ] },
  },
} as const

type Doc = keyof typeof DOCS
export function generateStaticParams() { return (Object.keys(DOCS) as Doc[]).map((doc) => ({ doc })) }
export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }): Promise<Metadata> {
  const { doc } = await params
  return { title: doc in DOCS ? DOCS[doc as Doc].en.title : 'Legal' }
}

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params
  if (!(doc in DOCS)) notFound()
  const locale = await getLocale()
  const d = DOCS[doc as Doc][locale]
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Link href="/" aria-label="Flow"><Wordmark /></Link>
      <h1 className="mt-10 text-3xl font-semibold tracking-tight">{d.title}</h1>
      <div className="mt-8 space-y-7">{d.body.map(([h, p]) => <section key={h}><h2 className="text-base font-semibold">{h}</h2><p className="mt-2 leading-relaxed text-text-2">{p}</p></section>)}</div>
      <p className="mt-12 text-xs text-text-3">{locale === 'fr' ? 'Dernière mise à jour' : 'Last updated'} : 2026-10-08</p>
    </div>
  )
}
