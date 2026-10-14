import { Agents, FaqSection, Features, FinalCta, Hero, Newsletter, PricingBox, Rules, Stack, ToutLeReste } from '@/components/site/home'

export default function Home() {
  return (
    <>
      <Hero />
      <Stack />
      <Features />
      <ToutLeReste />
      <Agents />
      <Rules />
      <PricingBox />
      <FaqSection />
      <Newsletter />
      <FinalCta />
    </>
  )
}
