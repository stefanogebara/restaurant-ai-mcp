import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Menu, X, Phone } from 'lucide-react';
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

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
      setIsMobileMenuOpen(false);
    }
  };

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled ? 'bg-cream-100/90 backdrop-blur-xl border-b border-cream-300 shadow-sm' : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="flex items-center space-x-2 cursor-pointer"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-burgundy-700 to-burgundy-900 flex items-center justify-center shadow-burgundy">
              <span className="text-2xl">🍽️</span>
            </div>
            <div>
              <h1 className="font-display text-xl font-bold text-burgundy-900">RestaurantAI</h1>
              <p className="font-sans text-xs text-charcoal-600">MCP Platform</p>
            </div>
          </motion.div>

          {/* Desktop Navigation */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="hidden md:flex items-center space-x-8"
          >
            <button
              onClick={() => scrollToSection('features')}
              className="font-sans font-medium text-charcoal-700 hover:text-burgundy-700 transition-colors duration-200"
            >
              Features
            </button>
            <button
              onClick={() => navigate('/live-demo')}
              className="font-sans font-medium text-charcoal-700 hover:text-burgundy-700 transition-colors duration-200"
            >
              Live Demo
            </button>
            <button
              onClick={() => scrollToSection('pricing')}
              className="font-sans font-medium text-charcoal-700 hover:text-burgundy-700 transition-colors duration-200"
            >
              Pricing
            </button>
            <button
              onClick={() => scrollToSection('faq')}
              className="font-sans font-medium text-charcoal-700 hover:text-burgundy-700 transition-colors duration-200"
            >
              FAQ
            </button>
            <button
              onClick={() => scrollToSection('contact')}
              className="px-6 py-2.5 font-sans font-semibold bg-gradient-to-r from-burgundy-700 to-burgundy-800 text-cream-50 rounded-lg shadow-burgundy hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200 flex items-center gap-2"
            >
              <Phone className="w-4 h-4" />
              Get Started
            </button>
          </motion.div>

          {/* Mobile Menu Button */}
          <div className="md:hidden">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="text-charcoal-700 hover:text-burgundy-700 p-2 bg-cream-100 border border-cream-300 rounded-lg transition-colors"
            >
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="md:hidden bg-cream-100/95 backdrop-blur-xl border-t border-cream-300"
        >
          <div className="px-4 py-6 space-y-4">
            <button
              onClick={() => scrollToSection('features')}
              className="block w-full text-left px-4 py-3 font-sans font-medium text-charcoal-700 hover:text-burgundy-700 hover:bg-cream-200 rounded-lg transition-all"
            >
              Features
            </button>
            <button
              onClick={() => {
                navigate('/live-demo');
                setIsMobileMenuOpen(false);
              }}
              className="block w-full text-left px-4 py-3 font-sans font-medium text-charcoal-700 hover:text-burgundy-700 hover:bg-cream-200 rounded-lg transition-all"
            >
              Live Demo
            </button>
            <button
              onClick={() => scrollToSection('pricing')}
              className="block w-full text-left px-4 py-3 font-sans font-medium text-charcoal-700 hover:text-burgundy-700 hover:bg-cream-200 rounded-lg transition-all"
            >
              Pricing
            </button>
            <button
              onClick={() => scrollToSection('faq')}
              className="block w-full text-left px-4 py-3 font-sans font-medium text-charcoal-700 hover:text-burgundy-700 hover:bg-cream-200 rounded-lg transition-all"
            >
              FAQ
            </button>
            <button
              onClick={() => scrollToSection('contact')}
              className="w-full px-6 py-3 font-sans font-semibold bg-gradient-to-r from-burgundy-700 to-burgundy-800 text-cream-50 rounded-lg shadow-burgundy flex items-center justify-center gap-2"
            >
              <Phone className="w-4 h-4" />
              Get Started
            </button>
          </div>
        </motion.div>
      )}
    </motion.nav>
  );
}
