/**
 * DemoSetupPage
 * Streamlined 2-step flow: Search restaurant → Enter email → Launch demo.
 * Google Places auto-scrapes hours, cuisine, phone, reviews.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import DemoSetupForm from '../components/landing/DemoSetupForm';
import { trackDemoCompleted } from '../lib/analytics';
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export default function DemoSetupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const handleSubmit = async (data: {
    restaurant_name: string;
    city: string;
    scraped_data: unknown;
  }) => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // RESTful path (rewritten to /api/demo?action=create server-side). The
      // `?action=create` query pattern matches some aggressive adblock filter
      // lists (uBlock Origin etc.), which silently aborts the POST before it
      // leaves the browser. The path-based form survives those filters.
      const response = await fetch(`${API_BASE}/api/demo/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // No contact fields: the demo is created gate-free and the contact
        // ask happens after the aha, via /api/demo/attach-contact.
        body: JSON.stringify({
          restaurant_name: data.restaurant_name,
          city: data.city,
          cuisine_type: (data.scraped_data as Record<string, string> | null)?.cuisine_type ?? 'Restaurant',
          scraped_data: data.scraped_data,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.demo_url) {
        throw new Error(result.error || t('demo.errors.createFailed', 'Failed to create demo. Please try again.'));
      }

      // Open-redirect guard: only navigate to relative same-origin paths.
      // A compromised backend or upstream bug returning an attacker-controlled
      // URL (e.g. "https://evil.com/phish") would otherwise carry the user off
      // the site silently.
      const demoUrl = String(result.demo_url || '');
      const isSafeRedirect = demoUrl.startsWith('/') && !demoUrl.startsWith('//');
      if (!isSafeRedirect) {
        console.error('[DemoSetup] backend returned non-relative demo_url', demoUrl);
        throw new Error(t('demo.errors.createFailed', 'Failed to create demo. Please try again.'));
      }

      trackDemoCompleted({ demo_token: result.demo_token || '' });
      // Pass scraped_data via router state so the demo dashboard can render
      // the "Here's your restaurant — already in our system" wow card with
      // the user's actual rating, address, editorial summary, and reviews.
      // The backend currently drops everything except hours/cuisine/phone,
      // so this is the only path that surfaces the rich Google Places data
      // on the demo dashboard.
      navigate(demoUrl, { state: { scraped_data: data.scraped_data } });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('demo.errors.generic', 'Something went wrong. Please try again.');
      setSubmitError(message);
      setIsSubmitting(false);
    }
  };

  return (
    // No page fill — the body's warm 4-orb gradient (index.css) shows through.
    // Painting bg-warm-white here would flatten it (DESIGN.md: pages never fill).
    <div className="min-h-screen text-deep-charcoal">
      <nav className="sticky top-0 z-50 flex items-center justify-between px-6 sm:px-16 py-4 bg-white/55 backdrop-blur-xl border-b border-glass-border-dark">
        <Link to="/" className="font-serif text-2xl text-deep-charcoal tracking-tight">
          seatable<span className="text-burgundy">.</span>
        </Link>
        <Link to="/login" className="text-sm font-medium text-stone-gray hover:text-deep-charcoal transition-colors">
          {t('landing.demoSetup.nav.signIn', 'Entrar')}
        </Link>
      </nav>

      <main className="px-6 py-14 sm:py-20">
        <div className="max-w-[560px] mx-auto">
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }} className="text-center mb-10">
            <h1 className="font-serif text-[38px] sm:text-[52px] leading-[1.05] tracking-tight text-deep-charcoal text-balance">
              {t('landing.demoSetup.title', 'Veja a sua IA atendendo o WhatsApp')}{' '}
              <span className="text-burgundy">{t('landing.demoSetup.titleEm', 'do seu restaurante')}</span>.
            </h1>
            <p className="text-[17px] text-warm-stone leading-[1.65] max-w-[440px] mx-auto mt-5 text-pretty">
              {t('landing.demoSetup.subtitle', 'Digite o nome e a cidade. A gente puxa seus horários, avaliações e cardápio do Google — e monta seu painel na hora.')}
            </p>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.08, ease: [0.23, 1, 0.32, 1] }}>
            <DemoSetupForm
              onSubmit={handleSubmit}
              isSubmitting={isSubmitting}
              submitError={submitError}
            />
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3, duration: 0.4 }}
            className="mt-6 text-center text-[13px] text-muted-stone"
          >
            {t('landing.demoSetup.trust.line', 'Leva 30 segundos, usa os dados reais do seu restaurante e não pede cartão.')}
          </motion.p>
        </div>
      </main>
    </div>
  );
}
