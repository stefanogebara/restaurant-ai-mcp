import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import LandingNav from '../components/LandingNav';
import HeroSection from '../components/HeroSection';
import SocialProofSection from '../components/SocialProofSection';
import FeaturesGrid from '../components/FeaturesGrid';
import HowItWorksSection from '../components/HowItWorksSection';
import InteractiveDemoSection from '../components/InteractiveDemoSection';
import PricingSection from '../components/PricingSection';
import FAQSection from '../components/FAQSection';
import ContactForm from '../components/ContactForm';
import Footer from '../components/Footer';

export default function LandingPage() {
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    document.documentElement.style.scrollBehavior = 'smooth';

    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 600);
    };
    window.addEventListener('scroll', handleScroll);

    return () => {
      document.documentElement.style.scrollBehavior = 'auto';
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#FAFAF9] text-[#1C1917] font-sans selection:bg-[#9F1239] selection:text-white overflow-x-hidden">
      <LandingNav />
      <HeroSection />
      <SocialProofSection />
      <FeaturesGrid />
      <HowItWorksSection />
      <PricingSection />

      {/* Testimonial */}
      <section className="py-24 px-6 sm:px-16 max-w-[800px] mx-auto text-center">
        <blockquote className="font-serif text-2xl sm:text-[32px] font-normal italic leading-[1.5] text-[#1C1917] tracking-tight mb-8">
          &ldquo;Seatable transformed how we handle reservations. Our AI agent sounds exactly like us &mdash; warm, knowledgeable, and always available.&rdquo;
        </blockquote>
        <cite className="not-italic text-sm text-[#78716C]">
          <strong className="text-[#1C1917] font-semibold block mb-0.5">Maria Gonzalez</strong>
          Owner, Celeri Madrid
        </cite>
      </section>

      {/* CTA */}
      <section className="px-6 sm:px-16 pb-24">
        <div className="max-w-[700px] mx-auto bg-[#1C1917] rounded-3xl p-16 sm:p-20 text-center">
          <h2 className="font-serif text-3xl sm:text-[40px] font-medium text-white mb-4 tracking-tight">
            Ready to reimagine<br />your restaurant?
          </h2>
          <p className="text-[16px] text-[#A8A29E] font-light mb-9">
            Join restaurants already using Seatable. Start your free trial today.
          </p>
          <a
            href="/#pricing"
            className="inline-block px-8 py-3.5 bg-[#9F1239] hover:bg-[#881337] text-white text-[15px] font-semibold rounded-full transition-colors"
          >
            Start Free Trial
          </a>
        </div>
      </section>

      <InteractiveDemoSection />
      <FAQSection />
      <ContactForm />
      <Footer />

      {/* Scroll to Top */}
      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-8 right-8 z-40 w-12 h-12 bg-[#1C1917] hover:bg-[#9F1239] text-white rounded-full flex items-center justify-center transition-colors"
          aria-label="Scroll to top"
        >
          <ArrowUp className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
