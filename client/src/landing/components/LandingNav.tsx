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
        isScrolled ? 'glass-nav' : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="flex items-center space-x-2"
          >
            <div className="w-10 h-10 rounded-xl glass-strong flex items-center justify-center">
              <span className="text-2xl">🍽️</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Restaurant AI</h1>
              <p className="text-xs text-gray-400">MCP Platform</p>
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
              className="text-gray-300 hover:text-white transition-colors"
            >
              Features
            </button>
            <button
              onClick={() => navigate('/live-demo')}
              className="text-gray-300 hover:text-white transition-colors"
            >
              Live Demo
            </button>
            <button
              onClick={() => scrollToSection('pricing')}
              className="text-gray-300 hover:text-white transition-colors"
            >
              Pricing
            </button>
            <button
              onClick={() => scrollToSection('faq')}
              className="text-gray-300 hover:text-white transition-colors"
            >
              FAQ
            </button>
            <button
              onClick={() => scrollToSection('contact')}
              className="px-6 py-2 glass-button-primary text-white font-semibold flex items-center gap-2"
            >
              <Phone className="w-4 h-4" />
              Contact Sales
            </button>
          </motion.div>

          {/* Mobile Menu Button */}
          <div className="md:hidden">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="text-gray-300 hover:text-white p-2 glass rounded-lg"
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
          className="md:hidden glass-strong border-t border-white/10"
        >
          <div className="px-4 py-6 space-y-4">
            <button
              onClick={() => scrollToSection('features')}
              className="block w-full text-left px-4 py-2 text-gray-300 hover:text-white hover:bg-white/5 rounded-lg transition-all"
            >
              Features
            </button>
            <button
              onClick={() => {
                navigate('/live-demo');
                setIsMobileMenuOpen(false);
              }}
              className="block w-full text-left px-4 py-2 text-gray-300 hover:text-white hover:bg-white/5 rounded-lg transition-all"
            >
              Live Demo
            </button>
            <button
              onClick={() => scrollToSection('pricing')}
              className="block w-full text-left px-4 py-2 text-gray-300 hover:text-white hover:bg-white/5 rounded-lg transition-all"
            >
              Pricing
            </button>
            <button
              onClick={() => scrollToSection('faq')}
              className="block w-full text-left px-4 py-2 text-gray-300 hover:text-white hover:bg-white/5 rounded-lg transition-all"
            >
              FAQ
            </button>
            <button
              onClick={() => scrollToSection('contact')}
              className="w-full px-6 py-3 glass-button-primary text-white font-semibold flex items-center justify-center gap-2"
            >
              <Phone className="w-4 h-4" />
              Contact Sales
            </button>
          </div>
        </motion.div>
      )}
    </motion.nav>
  );
}
