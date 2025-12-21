import { useEffect } from 'react';
import LandingNav from '../components/LandingNav';
import HeroSection from '../components/HeroSection';
import FeaturesGrid from '../components/FeaturesGrid';
import InteractiveDemoSection from '../components/InteractiveDemoSection';
import PricingSection from '../components/PricingSection';
import FAQSection from '../components/FAQSection';
import ContactForm from '../components/ContactForm';
import Footer from '../components/Footer';

export default function LandingPage() {
  useEffect(() => {
    // Smooth scroll behavior for the entire page
    document.documentElement.style.scrollBehavior = 'smooth';

    return () => {
      document.documentElement.style.scrollBehavior = 'auto';
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#FAFAF9] text-[#1C1917] font-sans selection:bg-[#9F1239] selection:text-white overflow-x-hidden">
      <LandingNav />
      <HeroSection />
      <FeaturesGrid />
      <InteractiveDemoSection />
      <PricingSection />
      <FAQSection />
      <ContactForm />
      <Footer />
    </div>
  );
}
