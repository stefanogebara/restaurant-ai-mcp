import { useState, useEffect, useRef, useCallback } from 'react';
import { Menu, X, Globe } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function LandingNav() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const currentLang = i18n.language?.startsWith('pt') ? 'PT' : 'EN';

  const closeMobileMenu = useCallback(() => {
    setIsMobileMenuOpen(false);
  }, []);

  const toggleLanguage = () => {
    const next = currentLang === 'PT' ? 'en' : 'pt-BR';
    i18n.changeLanguage(next);
  };

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
    closeMobileMenu();
  };

  // Close menu when clicking outside
  useEffect(() => {
    if (!isMobileMenuOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        toggleRef.current && !toggleRef.current.contains(e.target as Node)
      ) {
        closeMobileMenu();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMobileMenuOpen, closeMobileMenu]);

  return (
    <nav className="relative sticky top-0 z-50 flex items-center justify-between px-6 sm:px-16 py-6 bg-[rgba(250,250,249,0.8)] backdrop-blur-xl border-b border-border-gray">
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
          {t('landing.nav.features')}
        </button>
        <button type="button" onClick={() => scrollToSection('pricing')} className="text-sm font-medium text-stone-gray hover:text-deep-charcoal transition-colors">
          {t('landing.nav.pricing')}
        </button>
        <button type="button" onClick={() => navigate('/live-demo')} className="text-sm font-medium text-stone-gray hover:text-deep-charcoal transition-colors">
          {t('landing.nav.demo')}
        </button>
        <button type="button" onClick={() => scrollToSection('contact')} className="text-sm font-medium text-stone-gray hover:text-deep-charcoal transition-colors">
          {t('landing.nav.contact')}
        </button>
        <Link to="/demo/setup" className="text-sm font-medium text-burgundy hover:text-burgundy-dark transition-colors">
          {t('landing.nav.tryFree')}
        </Link>
        <Link to="/login" className="text-sm font-medium text-stone-gray hover:text-deep-charcoal transition-colors">
          {t('landing.nav.signIn')}
        </Link>
        <button
          type="button"
          onClick={toggleLanguage}
          className="flex items-center gap-1.5 text-sm font-medium text-stone-gray hover:text-deep-charcoal transition-colors"
          aria-label="Toggle language"
        >
          <Globe className="w-4 h-4" />
          {currentLang}
        </button>
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
        {t('landing.nav.getStarted')}
      </button>

      {/* Mobile Menu Button */}
      <button
        ref={toggleRef}
        type="button"
        className="md:hidden text-deep-charcoal p-1"
        onClick={() => setIsMobileMenuOpen((prev) => !prev)}
        aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={isMobileMenuOpen}
      >
        {isMobileMenuOpen ? <X aria-hidden="true" size={24} /> : <Menu aria-hidden="true" size={24} />}
      </button>

      {/* Mobile Menu Backdrop */}
      <div
        className={`md:hidden fixed inset-0 bg-black/20 backdrop-blur-sm transition-opacity duration-200 ${
          isMobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        style={{ zIndex: 40 }}
        onClick={closeMobileMenu}
        aria-hidden="true"
      />

      {/* Mobile Menu Dropdown */}
      <div
        ref={menuRef}
        className={`md:hidden absolute top-full left-0 right-0 bg-white border-b border-border-gray shadow-lg px-6 py-6 space-y-1 transition-all duration-200 ease-out origin-top ${
          isMobileMenuOpen
            ? 'opacity-100 scale-y-100 translate-y-0'
            : 'opacity-0 scale-y-95 -translate-y-2 pointer-events-none'
        }`}
        style={{ zIndex: 50 }}
      >
        <button type="button" onClick={() => scrollToSection('features')} className="block w-full text-left text-sm font-medium text-stone-gray hover:text-deep-charcoal hover:bg-stone-50 transition-colors py-3 px-2 rounded-lg">
          {t('landing.nav.features')}
        </button>
        <button type="button" onClick={() => scrollToSection('pricing')} className="block w-full text-left text-sm font-medium text-stone-gray hover:text-deep-charcoal hover:bg-stone-50 transition-colors py-3 px-2 rounded-lg">
          {t('landing.nav.pricing')}
        </button>
        <button type="button" onClick={() => { navigate('/live-demo'); closeMobileMenu(); }} className="block w-full text-left text-sm font-medium text-stone-gray hover:text-deep-charcoal hover:bg-stone-50 transition-colors py-3 px-2 rounded-lg">
          {t('landing.nav.demo')}
        </button>
        <button type="button" onClick={() => scrollToSection('contact')} className="block w-full text-left text-sm font-medium text-stone-gray hover:text-deep-charcoal hover:bg-stone-50 transition-colors py-3 px-2 rounded-lg">
          {t('landing.nav.contact')}
        </button>
        <Link to="/demo/setup" onClick={closeMobileMenu} className="block text-left text-sm font-medium text-burgundy hover:text-burgundy-dark hover:bg-stone-50 transition-colors py-3 px-2 rounded-lg">
          {t('landing.nav.tryFree')}
        </Link>
        <Link to="/login" onClick={closeMobileMenu} className="block text-left text-sm font-medium text-stone-gray hover:text-deep-charcoal hover:bg-stone-50 transition-colors py-3 px-2 rounded-lg">
          {t('landing.nav.signIn')}
        </Link>
        <button
          type="button"
          onClick={toggleLanguage}
          className="flex items-center gap-1.5 text-sm font-medium text-stone-gray hover:text-deep-charcoal hover:bg-stone-50 transition-colors py-3 px-2 rounded-lg"
        >
          <Globe className="w-4 h-4" />
          {currentLang}
        </button>
        <div className="pt-4 border-t border-border-gray">
          <button
            type="button"
            onClick={() => {
              closeMobileMenu();
              const el = document.getElementById('pricing');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
              else navigate('/#pricing');
            }}
            className="block w-full bg-deep-charcoal text-white text-center px-6 py-3 text-sm font-semibold rounded-full hover:bg-charcoal-dark transition-colors"
          >
            {t('landing.nav.getStarted')}
          </button>
        </div>
      </div>
    </nav>
  );
}
