import { LandingNav } from '@/components/landing/nav'
import { CookieNotice, Faq, Features, FinalCta, Footer, Hero, Security, Speed } from '@/components/landing/sections'

export default function Home() {
  return (
    <>
      <LandingNav />
      <main>
        <Hero />
        <Features />
        <Speed />
        <Security />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
      <CookieNotice />
    </>
  )
}
