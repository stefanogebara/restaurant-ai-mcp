/**
 * DemoSetupPage
 * Streamlined 2-step flow: Search restaurant → Enter email → Launch demo.
 * Google Places auto-scrapes hours, cuisine, phone, reviews.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import DemoSetupForm from '../components/landing/DemoSetupForm';
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export default function DemoSetupPage() {
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const handleSubmit = async (data: {
    restaurant_name: string;
    city: string;
    contact_email: string;
    scraped_data: unknown;
  }) => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch(`${API_BASE}/api/demo?action=create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurant_name: data.restaurant_name,
          city: data.city,
          contact_email: data.contact_email,
          contact_name: data.contact_email.split('@')[0],
          cuisine_type: (data.scraped_data as Record<string, string> | null)?.cuisine_type ?? 'Restaurant',
          scraped_data: data.scraped_data,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.demo_url) {
        throw new Error(result.error || 'Failed to create demo. Please try again.');
      }

      window.location.href = result.demo_url;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setSubmitError(message);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-warm-white text-deep-charcoal">
      <nav className="sticky top-0 z-50 flex items-center justify-between px-6 sm:px-16 py-5 bg-warm-white/90 backdrop-blur-xl border-b border-border-gray">
        <Link to="/" className="font-serif text-2xl font-semibold text-deep-charcoal tracking-tight">
          seatable<span className="text-burgundy">.</span>
        </Link>
        <Link to="/login" className="text-sm font-medium text-stone-gray hover:text-deep-charcoal transition-colors">
          {t('landing.demoSetup.nav.signIn')}
        </Link>
      </nav>

      <main className="px-6 py-16 sm:py-24">
        <div className="max-w-[640px] mx-auto">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} className="text-center mb-12">
            <div className="inline-block text-xs font-semibold tracking-[1.5px] uppercase text-burgundy bg-burgundy/[6%] border border-burgundy/15 px-4 py-1.5 rounded-full mb-6">
              {t('landing.demoSetup.badge')}
            </div>
            <h1 className="font-serif text-4xl sm:text-[44px] font-medium leading-[1.1] tracking-tight text-deep-charcoal mb-4">
              {t('landing.demoSetup.title', 'See Seatable running')}<br />
              <em className="text-burgundy">{t('landing.demoSetup.titleEm', 'in your restaurant')}</em> {t('landing.demoSetup.titleSuffix', 'in seconds.')}
            </h1>
            <p className="text-[17px] text-warm-stone font-light leading-[1.7] max-w-[480px] mx-auto">
              {t('landing.demoSetup.subtitle', "Just tell us your restaurant name and city. We'll pull in your hours, reviews, and details automatically.")}
            </p>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}>
            <DemoSetupForm
              onSubmit={handleSubmit}
              isSubmitting={isSubmitting}
              submitError={submitError}
            />
          </motion.div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35, duration: 0.4 }} className="mt-10 flex justify-center gap-10 text-center">
            <div>
              <div className="text-xl font-serif font-bold text-deep-charcoal">30s</div>
              <div className="text-xs text-muted-stone uppercase tracking-wider">{t('landing.demoSetup.trust.setupTime', 'Setup Time')}</div>
            </div>
            <div className="w-px bg-border-gray" />
            <div>
              <div className="text-xl font-serif font-bold text-burgundy">{t('landing.demoSetup.trust.realData', 'Real Data')}</div>
              <div className="text-xs text-muted-stone uppercase tracking-wider">{t('landing.demoSetup.trust.hoursReviews', 'Your Hours & Reviews')}</div>
            </div>
            <div className="w-px bg-border-gray" />
            <div>
              <div className="text-xl font-serif font-bold text-deep-charcoal">24/7</div>
              <div className="text-xs text-muted-stone uppercase tracking-wider">{t('landing.demoSetup.trust.aiBooking')}</div>
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
