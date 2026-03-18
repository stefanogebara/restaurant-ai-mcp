import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trackDemoSlideInAction, trackShareClicked } from '../../lib/analytics';

const STORAGE_KEY = 'seatable-demo-slidein-dismissed';

function getStorageItem(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function setStorageItem(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Safari incognito or storage disabled — silently skip
  }
}

export default function DemoSlideIn() {
  const [visible, setVisible] = useState(false);
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    if (getStorageItem(STORAGE_KEY)) return;
    const timer = setTimeout(() => setVisible(true), 60_000);
    return () => clearTimeout(timer);
  }, []);

  const dismiss = () => {
    setVisible(false);
    setStorageItem(STORAGE_KEY, '1');
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 100, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 60, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          className="fixed bottom-6 right-6 z-50 max-w-sm w-full bg-white rounded-2xl shadow-2xl border border-border-gray p-6"
        >
          <button
            type="button"
            onClick={() => { trackDemoSlideInAction({ action: 'dismiss' }); dismiss(); }}
            className="absolute top-3 right-3 text-muted-stone hover:text-deep-charcoal transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>

          <Sparkles size={20} className="text-burgundy mb-3" />

          <h3 className="font-serif text-lg font-semibold text-deep-charcoal mb-1">
            {t('landing.slideIn.title', 'This is sample data')}
          </h3>
          <p className="text-sm text-muted-stone mb-4">
            {t('landing.slideIn.subtitle', 'Want to see YOUR restaurant here? Setup takes 30 seconds.')}
          </p>

          <button
            type="button"
            onClick={() => { trackDemoSlideInAction({ action: 'cta' }); dismiss(); navigate('/demo/setup'); }}
            className="w-full bg-burgundy hover:bg-burgundy-dark text-white text-sm font-medium py-2.5 rounded-full transition-colors"
          >
            {t('landing.slideIn.cta', 'Set up my restaurant')} &rarr;
          </button>

          <div className="flex items-center gap-2 mt-3">
            <button
              type="button"
              onClick={() => { trackDemoSlideInAction({ action: 'later' }); dismiss(); }}
              className="flex-1 text-sm text-muted-stone hover:text-deep-charcoal py-1 transition-colors"
            >
              {t('landing.slideIn.later', 'Maybe later')}
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(t('landing.share.message', 'Check out Seatable — AI that answers calls, WhatsApp, and manages reservations for restaurants. Try the demo: https://seatable.one'))}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackShareClicked({ location: 'post_demo', channel: 'whatsapp' })}
              className="text-xs text-warm-stone hover:text-[#9F1239] transition-colors underline underline-offset-2"
            >
              {t('landing.slideIn.share', 'Share with a friend')}
            </a>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
