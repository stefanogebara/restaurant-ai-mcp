import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 sm:px-16 py-6 border-b border-glass-border-dark">
        <Link to="/" className="font-serif text-2xl font-semibold tracking-tight text-deep-charcoal">
          seatable<span className="text-burgundy">.</span>
        </Link>
      </nav>

      {/* 404 Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="relative mb-4">
          <span className="font-serif text-[120px] sm:text-[180px] font-medium leading-none tracking-[-8px] text-border-gray">
            404
          </span>
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 w-[120px] h-1 bg-burgundy rounded-full" />
        </div>

        {/* Restaurant-themed pre-title — softens the 404 from a system error
            page into a hospitality moment, while the formal "Page not found"
            headline below preserves the actual signal for users who need it.
            Falls back to a generic spinner if i18n hasn't loaded yet. */}
        <p className="text-sm font-medium text-burgundy mb-2">
          {t('notFound.preTitle', 'Esta mesa está vazia 🍽️')}
        </p>

        <h1 className="font-serif text-2xl sm:text-4xl font-medium tracking-tight mb-3">
          {t('notFound.title')}
        </h1>

        <p className="text-base text-warm-stone font-light max-w-[400px] leading-relaxed mb-10">
          {t('notFound.description')}
        </p>

        <div className="flex gap-3">
          <Link
            to="/"
            className="text-[15px] font-semibold text-white bg-burgundy hover:bg-burgundy-dark px-8 py-3.5 rounded-full transition-colors"
          >
            {t('notFound.goHome')}
          </Link>
          <button
            onClick={() => {
              // history.back() silently does nothing if the user landed here
              // from an external link or a fresh tab. Fall back to the home
              // route in that case so the secondary CTA always recovers.
              if (window.history.length > 1) window.history.back();
              else window.location.href = '/';
            }}
            className="text-[15px] font-medium text-stone-gray border border-glass-border-dark hover:border-muted-stone px-8 py-3.5 rounded-full transition-colors"
          >
            {t('notFound.goBack')}
          </button>
        </div>

        {/* Recovery chips — three common destinations the user may have been
            after. Keeps the page from being a dead-end when the broken link
            text didn't quite match what they meant to click. */}
        <div className="flex flex-wrap items-center justify-center gap-2 mt-8 text-xs text-muted-stone">
          <span className="text-stone-gray">{t('notFound.suggestionsLabel', 'Procurando algo?')}</span>
          <Link to="/host-dashboard/simple" className="px-3 py-1.5 rounded-full border border-glass-border-dark bg-white/60 backdrop-blur-glass-chip text-deep-charcoal hover:bg-white/85 transition-colors">
            {t('notFound.suggestDashboard', 'Painel')}
          </Link>
          <Link to="/host-dashboard/settings" className="px-3 py-1.5 rounded-full border border-glass-border-dark bg-white/60 backdrop-blur-glass-chip text-deep-charcoal hover:bg-white/85 transition-colors">
            {t('notFound.suggestSettings', 'Configurações')}
          </Link>
          <Link to="/login" className="px-3 py-1.5 rounded-full border border-glass-border-dark bg-white/60 backdrop-blur-glass-chip text-deep-charcoal hover:bg-white/85 transition-colors">
            {t('notFound.suggestSignIn', 'Entrar')}
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="px-8 sm:px-16 py-6 border-t border-glass-border-dark text-center">
        <p className="text-[13px] text-muted-stone">{t('notFound.copyright')}</p>
      </footer>
    </div>
  );
}
