import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { trackCtaClicked, trackHeadlineVariantViewed } from '../../lib/analytics';
import HeroSplitScreen from './HeroSplitScreen';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const HEADLINES: Record<string, { key: string; fallback: string }> = {
  a: { key: 'landing.hero.headlineA', fallback: 'Last night at 2 AM, someone booked a table at your restaurant.' },
  b: { key: 'landing.hero.headlineB', fallback: 'The host that never calls in sick.' },
  c: { key: 'landing.hero.headlineC', fallback: 'Your restaurant never sleeps.' },
};

// ─── TypeFx — cycling typewriter text ───────────────────────────
function TypeFx({ words, className = '' }: { words: string[]; className?: string }) {
  const [index, setIndex] = useState(0);
  const [displayed, setDisplayed] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const word = words[index];
    const speed = isDeleting ? 35 : 60;
    const holdTime = 2200;

    if (!isDeleting && displayed === word) {
      const timeout = setTimeout(() => setIsDeleting(true), holdTime);
      return () => clearTimeout(timeout);
    }

    if (isDeleting && displayed === '') {
      setIsDeleting(false);
      // DD.2 — functional updater so back-to-back triggers (StrictMode
      // double-invoke, fast successive word completions) advance from
      // the current index instead of a stale closure value.
      setIndex((prev) => (prev + 1) % words.length);
      return;
    }

    const timeout = setTimeout(() => {
      setDisplayed(
        isDeleting ? word.slice(0, displayed.length - 1) : word.slice(0, displayed.length + 1)
      );
    }, speed);

    return () => clearTimeout(timeout);
  }, [displayed, isDeleting, index, words]);

  return (
    <span className={className}>
      {displayed}
      <motion.span
        animate={{ opacity: [1, 0, 1] }}
        transition={{ duration: 0.8, repeat: Infinity }}
        className="inline-block w-[3px] h-[0.85em] bg-burgundy ml-0.5 align-middle"
      />
    </span>
  );
}

// ─── Cycling words per language ─────────────────────────────────
const TYPING_WORDS: Record<string, string[]> = {
  // English keeps "walk-in" — it's natural English. Portuguese and Spanish
  // had the anglicism leaking through; replaced with natural phrasings the
  // audit identified (cliente sem reserva / cliente sin reserva).
  en: ['a reservation.', 'a WhatsApp message.', 'a phone call.', 'a walk-in question.'],
  pt: ['uma reserva.', 'uma mensagem no WhatsApp.', 'uma ligação.', 'uma pergunta de cliente sem reserva.'],
  es: ['una reserva.', 'un mensaje de WhatsApp.', 'una llamada.', 'una pregunta de un cliente sin reserva.'],
};

function getTypingWords(lang: string): string[] {
  if (lang.startsWith('pt')) return TYPING_WORDS.pt;
  if (lang.startsWith('es')) return TYPING_WORDS.es;
  return TYPING_WORDS.en;
}

export default function HeroSection() {
  const { t, i18n } = useTranslation();
  const [params] = useSearchParams();

  // A/B headline via ?headline=a|b|c (default: a)
  const variant = (params.get('headline') || 'a').toLowerCase();
  const headline = HEADLINES[variant] || HEADLINES.a;

  useEffect(() => {
    trackHeadlineVariantViewed({ variant });
  }, [variant]);

  const scrollToDemo = () => {
    trackCtaClicked({ cta: 'primary', location: 'hero' });
    const el = document.getElementById('try-demo');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const typingWords = getTypingWords(i18n.language);

  return (
    <section
      className="pt-24 pb-16 px-6 sm:px-16 max-w-[1200px] mx-auto text-center"
      data-headline-variant={variant}
    >
      {/* Badge */}
      <div className="inline-block text-xs font-semibold tracking-[1.5px] uppercase text-burgundy bg-burgundy/[6%] border border-burgundy/15 px-4 py-1.5 rounded-full mb-8">
        {t('landing.badge')}
      </div>

      {/* Pain-first headline */}
      <h1 className="font-serif text-4xl sm:text-5xl lg:text-[64px] font-medium leading-[1.08] tracking-tight text-deep-charcoal mb-3 max-w-[800px] mx-auto">
        {t(headline.key, headline.fallback)}
      </h1>

      {/* AI answered line with TypeFx (variant a) or static (b/c) */}
      {variant === 'a' ? (
        <p className="font-serif text-3xl sm:text-4xl lg:text-[48px] font-medium leading-[1.1] tracking-tight mb-7 max-w-[800px] mx-auto">
          <span className="text-deep-charcoal">
            {t('landing.hero.typingPrefix', 'Your AI answered')}{' '}
          </span>
          <TypeFx words={typingWords} className="text-burgundy" />
        </p>
      ) : null}

      {/* Subtitle */}
      <p className="text-lg text-warm-stone font-light leading-[1.7] max-w-[600px] mx-auto mb-10">
        {t('landing.hero.subtitle2', 'Seatable handles WhatsApp, phone calls, and walk-ins — so your team focuses on hospitality.')}
      </p>

      {/* Single CTA */}
      <button
        type="button"
        onClick={scrollToDemo}
        className="px-10 py-4 bg-burgundy hover:bg-burgundy-dark text-white text-base font-semibold rounded-full transition-colors"
      >
        {t('landing.hero.ctaNew', 'See it live ↓')}
      </button>

      {/* Split-screen animation */}
      <div className="mt-16 px-0 sm:px-4">
        <HeroSplitScreen />
      </div>
    </section>
  );
}
