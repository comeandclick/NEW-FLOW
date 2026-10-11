import { Agents, FaqSection, Features, FinalCta, Hero, Newsletter, PricingBox, Rules, Stack } from '@/components/site/home'

export default function Home() {
  return (
    <>
      <Hero />
      <Stack />
      <Features />
      <Agents />
      <Rules />
      <PricingBox />
      <FaqSection />
      <Newsletter />
      <FinalCta />
    </>
  )
}
