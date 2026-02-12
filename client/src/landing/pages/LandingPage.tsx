import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp } from 'lucide-react';
import LandingNav from '../components/LandingNav';
import HeroSection from '../components/HeroSection';
import FeaturesGrid from '../components/FeaturesGrid';
import InteractiveDemoSection from '../components/InteractiveDemoSection';
import PricingSection from '../components/PricingSection';
import FAQSection from '../components/FAQSection';
import ContactForm from '../components/ContactForm';
import Footer from '../components/Footer';
import SocialProofSection from '../components/SocialProofSection';
import HowItWorksSection from '../components/HowItWorksSection';

export default function LandingPage() {
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    // Smooth scroll behavior for the entire page
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
      <HowItWorksSection />
      <FeaturesGrid />
      <InteractiveDemoSection />
      <PricingSection />
      <FAQSection />
      <ContactForm />
      <Footer />

      {/* Scroll to Top Button */}
      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={scrollToTop}
            className="fixed bottom-8 right-8 z-40 w-12 h-12 bg-[#1C1917] hover:bg-[#9F1239] text-white rounded-full shadow-lg hover:shadow-xl transition-colors duration-300 flex items-center justify-center"
            aria-label="Scroll to top"
          >
            <ArrowUp className="w-5 h-5" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
