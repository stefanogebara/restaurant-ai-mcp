/**
 * SeoNav — lightweight navigation bar for SEO landing pages.
 * No auth state needed. Links to home, demo, and login.
 */

import { Link } from 'react-router-dom';

export default function SeoNav() {
  return (
    <nav className="border-b border-glass-border-dark bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
        <Link
          to="/"
          className="font-serif text-xl text-deep-charcoal hover:opacity-80 transition-opacity"
        >
          seatable<span className="text-burgundy">.</span>
        </Link>

        <div className="flex items-center gap-4">
          <Link
            to="/login"
            className="text-sm text-warm-stone hover:text-deep-charcoal transition-colors hidden sm:inline"
          >
            Entrar
          </Link>
          <Link
            to="/demo/setup"
            className="px-5 py-2 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-semibold rounded-xl transition-colors"
          >
            Teste gr&aacute;tis
          </Link>
        </div>
      </div>
    </nav>
  );
}
