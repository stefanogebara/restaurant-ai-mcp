/**
 * SeoFooter — minimal footer for SEO landing pages.
 * Links to key pages and displays copyright.
 */

import { Link } from 'react-router-dom';

export default function SeoFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border-gray bg-warm-white py-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link
            to="/"
            className="font-serif text-lg font-bold text-deep-charcoal"
          >
            seatable<span className="text-burgundy">.</span>
          </Link>

          <div className="flex flex-wrap items-center gap-4 text-sm text-warm-stone">
            <Link to="/" className="hover:text-burgundy transition-colors">
              In&iacute;cio
            </Link>
            <Link to="/live-demo" className="hover:text-burgundy transition-colors">
              Demo
            </Link>
            <Link to="/privacy" className="hover:text-burgundy transition-colors">
              Privacidade
            </Link>
            <Link to="/terms" className="hover:text-burgundy transition-colors">
              Termos
            </Link>
          </div>

          <p className="text-xs text-warm-stone">
            &copy; {year} Seatable. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}
