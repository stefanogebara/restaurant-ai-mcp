import { useEffect } from 'react';
import LandingNav from '../components/LandingNav';
import HeroSection from '../components/HeroSection';
import FeaturesGrid from '../components/FeaturesGrid';
import InteractiveDemoSection from '../components/InteractiveDemoSection';
import PricingSection from '../components/PricingSection';
import FAQSection from '../components/FAQSection';
import ContactForm from '../components/ContactForm';
import Footer from '../components/Footer';
import '../styles/glass-morphism.css';

export default function LandingPage() {
  useEffect(() => {
    // Smooth scroll behavior for the entire page
    document.documentElement.style.scrollBehavior = 'smooth';

    return () => {
      document.documentElement.style.scrollBehavior = 'auto';
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0f] overflow-x-hidden">
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
