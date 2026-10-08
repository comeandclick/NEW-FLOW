import { FaqSection, FeatureCarousel, FinalCta, ForYou, Hero, Marquee, Modules, Newsletter, PricingBox, Stats, Steps } from '@/components/site/home'

export default function Home() {
  return (
    <>
      <Hero />
      <Marquee />
      <Stats />
      <FeatureCarousel />
      <Modules />
      <Steps />
      <ForYou />
      <PricingBox />
      <Newsletter />
      <FaqSection />
      <FinalCta />
    </>
  )
}
