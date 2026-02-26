import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';

export default function LandingNav() {
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
    setIsMobileMenuOpen(false);
  };

  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between px-6 sm:px-16 py-6 bg-[rgba(250,250,249,0.8)] backdrop-blur-xl border-b border-border-gray">
      {/* Logo */}
      <Link
        to="/"
        className="font-serif text-2xl font-semibold text-deep-charcoal tracking-tight hover:opacity-80 transition-opacity"
      >
        seatable<span className="text-burgundy">.</span>
      </Link>

      {/* Desktop Navigation */}
      <div className="hidden md:flex items-center gap-9">
        <button type="button" onClick={() => scrollToSection('features')} className="text-sm font-medium text-stone-gray hover:text-deep-charcoal transition-colors">
          Features
        </button>
        <button type="button" onClick={() => scrollToSection('pricing')} className="text-sm font-medium text-stone-gray hover:text-deep-charcoal transition-colors">
          Pricing
        </button>
        <button type="button" onClick={() => navigate('/live-demo')} className="text-sm font-medium text-stone-gray hover:text-deep-charcoal transition-colors">
          Demo
        </button>
        <button type="button" onClick={() => scrollToSection('contact')} className="text-sm font-medium text-stone-gray hover:text-deep-charcoal transition-colors">
          Contact
        </button>
        <Link to="/demo/setup" className="text-sm font-medium text-burgundy hover:text-burgundy-dark transition-colors">
          Try free demo
        </Link>
        <Link to="/login" className="text-sm font-medium text-stone-gray hover:text-deep-charcoal transition-colors">
          Sign in
        </Link>
      </div>

      {/* Desktop CTA */}
      <button
        type="button"
        onClick={() => {
          const el = document.getElementById('pricing');
          if (el) el.scrollIntoView({ behavior: 'smooth' });
          else navigate('/#pricing');
        }}
        className="hidden md:block px-6 py-2.5 bg-deep-charcoal text-white text-sm font-semibold rounded-full hover:bg-charcoal-dark transition-colors"
      >
        Get Started
      </button>

      {/* Mobile Menu Button */}
      <button
        type="button"
        className="md:hidden text-deep-charcoal"
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={isMobileMenuOpen}
      >
        {isMobileMenuOpen ? <X aria-hidden="true" size={24} /> : <Menu aria-hidden="true" size={24} />}
      </button>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 bg-black/20 backdrop-blur-sm z-[-1]"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div className="md:hidden absolute top-full left-0 right-0 bg-white border-b border-border-gray px-6 py-6 space-y-4">
            <button type="button" onClick={() => scrollToSection('features')} className="block w-full text-left text-sm font-medium text-stone-gray hover:text-deep-charcoal transition-colors py-2">
              Features
            </button>
            <button type="button" onClick={() => scrollToSection('pricing')} className="block w-full text-left text-sm font-medium text-stone-gray hover:text-deep-charcoal transition-colors py-2">
              Pricing
            </button>
            <button type="button" onClick={() => { navigate('/live-demo'); setIsMobileMenuOpen(false); }} className="block w-full text-left text-sm font-medium text-stone-gray hover:text-deep-charcoal transition-colors py-2">
              Demo
            </button>
            <button type="button" onClick={() => scrollToSection('contact')} className="block w-full text-left text-sm font-medium text-stone-gray hover:text-deep-charcoal transition-colors py-2">
              Contact
            </button>
            <Link to="/demo/setup" onClick={() => setIsMobileMenuOpen(false)} className="block text-left text-sm font-medium text-burgundy hover:text-burgundy-dark transition-colors py-2">
              Try free demo
            </Link>
            <Link to="/login" onClick={() => setIsMobileMenuOpen(false)} className="block text-left text-sm font-medium text-stone-gray hover:text-deep-charcoal transition-colors py-2">
              Sign in
            </Link>
            <div className="pt-4 border-t border-border-gray">
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  const el = document.getElementById('pricing');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                  else navigate('/#pricing');
                }}
                className="block w-full bg-deep-charcoal text-white text-center px-6 py-3 text-sm font-semibold rounded-full"
              >
                Get Started
              </button>
            </div>
          </div>
        </>
      )}
    </nav>
  );
}
