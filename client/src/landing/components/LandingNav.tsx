import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function LandingNav() {
  const navigate = useNavigate();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
    setIsMobileMenuOpen(false);
  };

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      className={`fixed w-full top-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'bg-[#FAFAF9]/95 backdrop-blur-md border-b border-[#E7E5E4] py-4'
          : 'bg-transparent py-6'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 md:px-12 flex justify-between items-center">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="font-serif text-2xl font-bold tracking-tight text-[#1C1917] cursor-pointer"
          onClick={() => navigate('/')}
        >
          Seatable<span className="text-[#9F1239]">.</span>
        </motion.div>

        {/* Desktop Navigation */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="hidden md:flex gap-8 text-sm font-medium tracking-wide text-[#57534E] uppercase"
        >
          <button
            onClick={() => navigate('/live-demo')}
            className="hover:text-[#9F1239] transition-colors"
          >
            Live Demo
          </button>
          <button
            onClick={() => scrollToSection('features')}
            className="hover:text-[#9F1239] transition-colors"
          >
            Features
          </button>
          <button
            onClick={() => scrollToSection('pricing')}
            className="hover:text-[#9F1239] transition-colors"
          >
            Pricing
          </button>
          <button
            onClick={() => scrollToSection('faq')}
            className="hover:text-[#9F1239] transition-colors"
          >
            FAQ
          </button>
        </motion.div>

        {/* Desktop CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="hidden md:flex gap-6 items-center"
        >
          <button
            onClick={() => navigate('/login')}
            className="text-[#1C1917] text-sm font-bold tracking-widest uppercase hover:text-[#9F1239] transition-colors"
          >
            Login
          </button>
          <button
            onClick={() => navigate('/onboarding')}
            className="bg-[#1C1917] text-[#FAFAF9] px-6 py-2.5 rounded-xl hover:bg-[#9F1239] transition-colors duration-300 text-sm tracking-widest font-bold uppercase"
          >
            Get Started
          </button>
        </motion.div>

        {/* Mobile Menu Button */}
        <button
          className="md:hidden text-[#1C1917]"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={isMobileMenuOpen}
        >
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Menu Backdrop */}
      {isMobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/20 backdrop-blur-sm z-[-1]"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="md:hidden bg-[#FAFAF9]/95 backdrop-blur-md border-t border-[#E7E5E4] px-6 py-6 space-y-4"
        >
          <button
            onClick={() => { navigate('/live-demo'); setIsMobileMenuOpen(false); }}
            className="block w-full text-left text-sm font-medium tracking-wide text-[#57534E] uppercase hover:text-[#9F1239] transition-colors py-2"
          >
            Live Demo
          </button>
          <button
            onClick={() => scrollToSection('features')}
            className="block w-full text-left text-sm font-medium tracking-wide text-[#57534E] uppercase hover:text-[#9F1239] transition-colors py-2"
          >
            Features
          </button>
          <button
            onClick={() => scrollToSection('pricing')}
            className="block w-full text-left text-sm font-medium tracking-wide text-[#57534E] uppercase hover:text-[#9F1239] transition-colors py-2"
          >
            Pricing
          </button>
          <button
            onClick={() => scrollToSection('faq')}
            className="block w-full text-left text-sm font-medium tracking-wide text-[#57534E] uppercase hover:text-[#9F1239] transition-colors py-2"
          >
            FAQ
          </button>
          <div className="pt-4 border-t border-[#E7E5E4] space-y-3">
            <button
              onClick={() => { navigate('/login'); setIsMobileMenuOpen(false); }}
              className="block w-full text-center text-sm font-bold tracking-widest uppercase text-[#1C1917] py-2"
            >
              Login
            </button>
            <button
              onClick={() => { navigate('/onboarding'); setIsMobileMenuOpen(false); }}
              className="block w-full bg-[#9F1239] text-white text-center px-6 py-3 text-sm tracking-widest font-bold uppercase rounded-xl"
            >
              Get Started
            </button>
          </div>
        </motion.div>
      )}
    </motion.nav>
  );
}
