import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-warm-white flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 sm:px-16 py-6 border-b border-border-gray">
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
            onClick={() => window.history.back()}
            className="text-[15px] font-medium text-stone-gray border border-border-gray hover:border-muted-stone px-8 py-3.5 rounded-full transition-colors"
          >
            {t('notFound.goBack')}
          </button>
        </div>
      </div>

      {/* Footer */}
      <footer className="px-8 sm:px-16 py-6 border-t border-border-gray text-center">
        <p className="text-[13px] text-muted-stone">{t('notFound.copyright')}</p>
      </footer>
    </div>
  );
}
