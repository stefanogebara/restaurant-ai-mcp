/**
 * DemoSetupPage
 * Conversion-optimised page that lets prospects create a personalised demo.
 * Submits to POST /api/demo?action=create and redirects to the returned demo_url.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import DemoSetupForm from '../components/landing/DemoSetupForm';

interface DemoFormData {
  restaurant_name: string;
  cuisine_type: string;
  city: string;
  country: string;
  open_time: string;
  close_time: string;
  max_party_size: number;
  cancellation_policy: string;
  custom_policy: string;
  contact_name: string;
  contact_email: string;
}

const INITIAL_FORM: DemoFormData = {
  restaurant_name: '',
  cuisine_type: '',
  city: '',
  country: '',
  open_time: '12:00',
  close_time: '23:00',
  max_party_size: 8,
  cancellation_policy: '',
  custom_policy: '',
  contact_name: '',
  contact_email: '',
};

export default function DemoSetupPage() {
  const { t } = useTranslation();
  const [form, setForm] = useState<DemoFormData>(INITIAL_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const update = (field: keyof DemoFormData, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch('/api/demo?action=create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok || !data.demo_url) {
        throw new Error(data.error || 'Failed to create demo. Please try again.');
      }
      window.location.href = data.demo_url;
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
              {t('landing.demoSetup.title')}<br />
              <em className="text-burgundy">{t('landing.demoSetup.titleEm')}</em> {t('landing.demoSetup.titleSuffix')}
            </h1>
            <p className="text-[17px] text-warm-stone font-light leading-[1.7] max-w-[480px] mx-auto">
              {t('landing.demoSetup.subtitle')}
            </p>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}>
            <DemoSetupForm form={form} isSubmitting={isSubmitting} submitError={submitError} onUpdate={update} onSubmit={handleSubmit} />
          </motion.div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35, duration: 0.4 }} className="mt-10 flex justify-center gap-10 text-center">
            <div>
              <div className="text-xl font-serif font-bold text-deep-charcoal">2.3s</div>
              <div className="text-xs text-muted-stone uppercase tracking-wider">{t('landing.demoSetup.trust.avgResponse')}</div>
            </div>
            <div className="w-px bg-border-gray" />
            <div>
              <div className="text-xl font-serif font-bold text-burgundy">6+</div>
              <div className="text-xs text-muted-stone uppercase tracking-wider">{t('landing.demoSetup.trust.languages')}</div>
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
