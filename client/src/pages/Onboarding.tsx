/**
 * Restaurant Onboarding Wizard - 6-Step Flow
 *
 * 1. Restaurant Info    — name, type, location, language
 * 2. Contact & Hours   — phone, email, WhatsApp, business hours
 * 3. Tables & Settings — dining areas + booking settings (collapsed)
 * 4. Review & Launch   — summary with edit links, then submit (creates restaurant)
 * 5. Import History    — optional CSV upload of past customers (requires restaurant_id)
 * 6. Teach Your AI     — optional interview + document upload
 *
 * AI Learning, Voice Selection, and Team Setup have been moved
 * to post-onboarding settings to reduce friction.
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import ThiingsIcon from '../components/common/ThiingsIcon';
import { useTranslation } from 'react-i18next';
import { useToast } from '../contexts/ToastContext';
import Step1Welcome from '../components/onboarding/Step1Welcome';
import Step2Contact from '../components/onboarding/Step2Contact';
import Step3TablesAndSettings from '../components/onboarding/Step3TablesAndSettings';
import Step4Review from '../components/onboarding/Step4Review';
import Step5ImportHistory from '../components/onboarding/Step5ImportHistory';
import Step6TeachAI from '../components/onboarding/Step6TeachAI';
import OnboardingSuccessModal from '../components/onboarding/OnboardingSuccessModal';
import OnboardingStepSidebar from '../components/onboarding/OnboardingStepSidebar';
import type { OnboardingData } from '../types/onboarding.types';
import { authFetch } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { trackOnboardingStepCompleted, trackOnboardingCompleted } from '../lib/analytics';
import { LS_CUSTOMER_EMAIL, LS_REFERRAL_CODE, LS_ONBOARDING_DATA, LS_ONBOARDING_STEP, LS_PENDING_DEMO_TOKEN } from '../config/localStorageKeys';

const STEP_NAME_KEYS = ['onboarding.stepName1', 'onboarding.stepName2', 'onboarding.stepName3', 'onboarding.stepName4', 'onboarding.stepName5', 'onboarding.stepName6'];
const TOTAL_STEPS = 6;

export default function Onboarding() {
  const { t } = useTranslation();
  useDocumentTitle(t('pageTitles.onboarding'));
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { error: showError } = useToast();
  const { user } = useAuth();
  const showSubscribeBanner = searchParams.get('reason') === 'subscribe';
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [ownReferral, setOwnReferral] = useState<{ code: string; url: string } | null>(null);
  const [bookingUrl, setBookingUrl] = useState<string | null>(null);

  const customerEmail = user?.email || localStorage.getItem(LS_CUSTOMER_EMAIL) || '';
  const [isPreFilledFromDemo, setIsPreFilledFromDemo] = useState(false);

  const buildDefaultData = (): OnboardingData => ({
    customer_email: customerEmail,
    restaurant_id: '',
    plan: 'Starter',
    // Step 1
    restaurant_name: '',
    restaurant_type: '',
    city: '',
    country: '',
    // Step 2
    phone_number: '',
    email: '',
    website: '',
    business_hours: [
      { day: 'Monday', is_open: true, open_time: '12:00', close_time: '23:00' },
      { day: 'Tuesday', is_open: true, open_time: '12:00', close_time: '23:00' },
      { day: 'Wednesday', is_open: true, open_time: '12:00', close_time: '23:00' },
      { day: 'Thursday', is_open: true, open_time: '12:00', close_time: '23:00' },
      { day: 'Friday', is_open: true, open_time: '12:00', close_time: '23:30' },
      { day: 'Saturday', is_open: true, open_time: '12:00', close_time: '23:30' },
      { day: 'Sunday', is_open: true, open_time: '12:00', close_time: '22:00' },
    ],
    average_dining_duration: 90,
    // Step 3
    areas: [
      {
        name: t('onboarding.areaIndoor'),
        is_active: true,
        tables: [
          { capacity: 2, count: 0, shape: 'square', is_fixed_seating: false, is_joinable: true },
          { capacity: 4, count: 0, shape: 'square', is_fixed_seating: false, is_joinable: true },
          { capacity: 6, count: 0, shape: 'square', is_fixed_seating: false, is_joinable: true },
          { capacity: 8, count: 0, shape: 'square', is_fixed_seating: false, is_joinable: true },
        ],
      },
    ],
    advance_booking_days: 30,
    buffer_time: 15,
    cancellation_policy: t('onboarding.cancelFree2h'),
    special_notes: '',
    // Team setup moved to Settings post-onboarding
    team_members: [],
  });

  // Restore in-progress onboarding from localStorage so "Save & Exit" and a
  // mid-wizard page refresh don't silently discard everything the user typed.
  // Only steps 1–4 are restored: those run *before* the restaurant exists.
  // Steps 5–6 are post-creation and optional — rehydrating a stale wizard
  // there risks a duplicate restaurant, so we fall back to a fresh start.
  const restoreOnboarding = (): { step: number; data: OnboardingData } => {
    const fresh = { step: 1, data: buildDefaultData() };
    try {
      const savedStep = parseInt(localStorage.getItem(LS_ONBOARDING_STEP) || '', 10);
      if (!Number.isFinite(savedStep) || savedStep < 1 || savedStep > 4) return fresh;
      const savedRaw = localStorage.getItem(LS_ONBOARDING_DATA);
      if (!savedRaw) return fresh;
      const saved = JSON.parse(savedRaw) as Partial<OnboardingData>;
      // A persisted restaurant_id means the restaurant was already created —
      // never rehydrate into a pre-creation step in that case.
      if (saved.restaurant_id) return fresh;
      return { step: savedStep, data: { ...fresh.data, ...saved } };
    } catch {
      return fresh;
    }
  };

  const [restored] = useState(restoreOnboarding);
  const [currentStep, setCurrentStep] = useState(restored.step);
  const [onboardingData, setOnboardingData] = useState<OnboardingData>(restored.data);

  // Once onboarding completes we stop persisting — otherwise the persist
  // effect below immediately re-writes the localStorage keys that
  // completeOnboarding() just cleared, leaving stale data behind.
  const completedRef = useRef(false);

  // Pre-fill from demo session if user arrived via demo conversion
  useEffect(() => {
    const demoToken = localStorage.getItem(LS_PENDING_DEMO_TOKEN);
    if (!demoToken) return;

    const apiBase = import.meta.env.VITE_API_BASE_URL || '/api';
    setIsDemoLoading(true);
    fetch(`${apiBase}/demo?action=session&token=${encodeURIComponent(demoToken)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.success || !data.restaurant) return;
        const r = data.restaurant;
        setOnboardingData((prev) => {
          const updates: Partial<OnboardingData> = {};
          // Step 1: Restaurant info
          if (r.restaurant_name) updates.restaurant_name = r.restaurant_name;
          if (r.restaurant_type) updates.restaurant_type = r.restaurant_type;
          if (r.city) updates.city = r.city;
          if (r.country) updates.country = r.country;
          // Step 2: Contact & Hours (from Google Maps scrape)
          if (r.phone) updates.phone_number = r.phone;
          if (r.email) updates.email = r.email;
          if (r.business_hours && typeof r.business_hours === 'object') {
            // Convert scraped hours to onboarding format
            const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
            const hours = days.map(day => {
              const dayHours = r.business_hours[day] || r.business_hours[day.toLowerCase()];
              if (!dayHours || dayHours === 'Closed' || dayHours === 'closed') {
                return { day, is_open: false, open_time: '12:00', close_time: '23:00' };
              }
              if (typeof dayHours === 'string') {
                const [open, close] = dayHours.split('-').map((s: string) => s.trim());
                return { day, is_open: true, open_time: open || '12:00', close_time: close || '23:00' };
              }
              if (typeof dayHours === 'object') {
                return { day, is_open: true, open_time: dayHours.open || '12:00', close_time: dayHours.close || '23:00' };
              }
              return { day, is_open: true, open_time: '12:00', close_time: '23:00' };
            });
            updates.business_hours = hours;
          }
          return { ...prev, ...updates };
        });
        setIsPreFilledFromDemo(true);
      })
      .catch((err) => {
        // Non-fatal — user fills in manually. Log to Sentry/Posthog so we can
        // catch a population-wide demo-prefill outage instead of silently
        // serving empty forms.
        console.error('[Onboarding] demo prefill failed', err);
      })
      .finally(() => { setIsDemoLoading(false); });
  }, []);

  // Persist progress so "Save & Exit" and accidental refreshes are recoverable
  // (restored on mount by restoreOnboarding). Stops once onboarding completes.
  useEffect(() => {
    if (completedRef.current) return;
    localStorage.setItem(LS_ONBOARDING_DATA, JSON.stringify(onboardingData));
    localStorage.setItem(LS_ONBOARDING_STEP, currentStep.toString());
  }, [onboardingData, currentStep]);

  // Countdown redirect after onboarding success.
  // Lands the user IN their dashboard with the LaunchChecklist modal open
  // (?launch=1 triggers it in Dashboard.tsx) — not on a Stripe billing page.
  // The billing/upgrade nudge belongs inside the product, not as the first
  // post-setup screen. Use window.location.href (not navigate) so React
  // Query / context state are reset cleanly for the new restaurant.
  useEffect(() => {
    if (!showSuccessModal) return;
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) { clearInterval(interval); window.location.href = '/host-dashboard/simple?launch=1'; return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [showSuccessModal]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateData = (updates: Partial<OnboardingData>) => {
    setOnboardingData((prev) => ({ ...prev, ...updates }));
  };

  const nextStep = () => {
    if (currentStep < TOTAL_STEPS) {
      trackOnboardingStepCompleted({ step: currentStep, step_name: t(STEP_NAME_KEYS[currentStep - 1]) });
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const goToStep = (step: number) => {
    if (step >= 1 && step <= TOTAL_STEPS) setCurrentStep(step);
  };

  const completeOnboarding = async () => {
    setIsSubmitting(true);
    try {
      const response = await authFetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(onboardingData),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMessage = data.message || data.error || t('onboarding.completeError', 'Failed to complete onboarding');
        const errorDetails = data.details ? `\n\nDetails: ${data.details}` : '';
        throw new Error(`${errorMessage}${errorDetails}`);
      }

      // M15: attach referral code BEFORE clearing localStorage. The previous
      // version cleared LS_REFERRAL_CODE in the same tick as a fire-and-forget
      // attach call — if the network request errored, the code was permanently
      // lost. Now we await the attach and only remove the LS key on success.
      const pendingReferralCode = localStorage.getItem(LS_REFERRAL_CODE);
      let referralAttached = false;
      if (pendingReferralCode) {
        try {
          const refRes = await authFetch('/api/referral?action=attach', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ referral_code: pendingReferralCode }),
          });
          // Backend can return 200 with {success: false, error: "..."} —
          // checking refRes.ok alone would have removed the localStorage key
          // and lost the referral credit. Inspect the payload too.
          if (refRes.ok) {
            const refBody = await refRes.json().catch(() => null);
            referralAttached = refBody?.success === true;
          }
        } catch (err) {
          // Network error — keep the code in localStorage so a later retry
          // doesn't lose the credit.
          console.error('[Onboarding] referral attach failed', err);
          referralAttached = false;
        }
      }

      // Persist the restaurant_id so Step 5 can POST to /api/manager-documents
      if (data.restaurant?.restaurant_id) {
        setOnboardingData((prev) => ({ ...prev, restaurant_id: data.restaurant.restaurant_id }));
      }
      if (data.restaurant?.booking_url) {
        setBookingUrl(`https://seatable.one${data.restaurant.booking_url}`);
      }

      // Mark complete BEFORE clearing storage so the persist effect doesn't
      // re-write the keys when the upcoming setCurrentStep(5)/setOnboardingData
      // calls re-trigger it.
      completedRef.current = true;
      localStorage.removeItem(LS_ONBOARDING_DATA);
      localStorage.removeItem(LS_ONBOARDING_STEP);
      // Only remove referral code if it was successfully attached (or never present)
      if (!pendingReferralCode || referralAttached) {
        localStorage.removeItem(LS_REFERRAL_CODE);
      }

      trackOnboardingCompleted({
        plan: onboardingData.plan ?? 'unknown',
        country: onboardingData.country,
        restaurant_type: onboardingData.restaurant_type,
      });

      // Fetch own referral code for share nudge (non-blocking)
      authFetch('/api/referral?action=code')
        .then((r) => r.json())
        .then((d) => {
          if (d.success && d.code) {
            setOwnReferral({ code: d.code, url: d.referral_url });
          }
        })
        .catch(() => { /* best-effort */ });

      // Advance to Step 5 (Teach Your AI) — the success modal fires after Step 5
      setCurrentStep(5);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : t('onboarding.completeError', 'Failed to complete onboarding. Please try again.'));
      setSubmitError(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const progressPercent = (currentStep / TOTAL_STEPS) * 100;

  return (
    <div className="min-h-screen bg-warm-white flex flex-col">
      {/* Subscribe redirect banner */}
      {showSubscribeBanner && (
        <div className="bg-burgundy text-white text-[13px] text-center py-2.5 px-4">
          {t('onboarding.subscribeBanner')}
        </div>
      )}
      {/* Top Bar */}
      <header className="flex items-center justify-between px-6 sm:px-12 py-5 border-b border-border-gray bg-white">
        <div className="font-serif text-xl font-semibold text-deep-charcoal">
          seatable<span className="text-burgundy">.</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[13px] text-warm-stone">{t('onboarding.stepOf', { current: currentStep, total: TOTAL_STEPS })}</span>
          <button
            onClick={() => {
              // H1 fix: route an authenticated mid-onboarding owner to their dashboard,
              // not to the public marketing landing page (which is in EN by default).
              navigate(user ? '/host-dashboard/simple' : '/');
            }}
            className="text-[13px] text-burgundy font-medium hover:text-burgundy-dark transition-colors"
          >
            {t('onboarding.saveAndExit')}
          </button>
        </div>
      </header>

      {/* Progress Bar */}
      <div className="h-[3px] bg-border-gray">
        <div
          className="h-full bg-burgundy rounded-r-full transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Mobile Step Dots */}
      <div className="flex md:hidden items-center justify-center gap-2 py-3 border-b border-border-gray">
        {[1, 2, 3, 4, 5, 6].map((s) => (
          <div key={s} className={`rounded-full transition-all duration-300 ${
            s < currentStep    ? 'w-2 h-2 bg-burgundy'
            : s === currentStep ? 'w-6 h-2 bg-burgundy'
            : 'w-2 h-2 bg-border-gray'
          }`} />
        ))}
      </div>

      {/* Layout */}
      <div className="flex-1 flex max-w-[1000px] mx-auto w-full px-6 sm:px-12 py-12 gap-16">
        {/* Step Sidebar */}
        <OnboardingStepSidebar currentStep={currentStep} goToStep={goToStep} />

        {/* Form Content */}
        <div className="flex-1 max-w-[480px]">
          {currentStep === 1 && isPreFilledFromDemo && (
            <div className="mb-5 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-burgundy/[0.06] border border-burgundy/20 text-[13px] text-burgundy font-medium">
              <ThiingsIcon name="sparkles" pxSize={15} />
              {t('onboarding.prefilledFromDemo')}
            </div>
          )}
          {currentStep === 1 && (
            <Step1Welcome
              data={onboardingData}
              updateData={updateData}
              onNext={nextStep}
              isDemoLoading={isDemoLoading}
            />
          )}
          {currentStep === 2 && (
            <Step2Contact
              data={onboardingData}
              updateData={updateData}
              onNext={nextStep}
              onBack={prevStep}
            />
          )}
          {currentStep === 3 && (
            <Step3TablesAndSettings
              data={onboardingData}
              updateData={updateData}
              onNext={nextStep}
              onBack={prevStep}
            />
          )}
          {currentStep === 4 && submitError && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between gap-4">
              <p className="text-sm text-red-700">{t('onboarding.setupFailed')}</p>
              <button
                type="button"
                onClick={() => { setSubmitError(false); completeOnboarding(); }}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 flex-shrink-0"
              >
                {t('onboarding.tryAgain')}
              </button>
            </div>
          )}
          {currentStep === 4 && (
            <Step4Review
              data={onboardingData}
              updateData={updateData}
              onBack={prevStep}
              onComplete={completeOnboarding}
              isSubmitting={isSubmitting}
              goToStep={goToStep}
            />
          )}
          {currentStep === 5 && (
            <Step5ImportHistory
              restaurantId={onboardingData.restaurant_id}
              onNext={nextStep}
            />
          )}
          {currentStep === 6 && (
            <Step6TeachAI
              restaurantId={onboardingData.restaurant_id}
              restaurantName={onboardingData.restaurant_name}
              city={onboardingData.city}
              country={onboardingData.country}
              website={onboardingData.website}
              onNext={() => setShowSuccessModal(true)}
            />
          )}
        </div>
      </div>

      {/* Success Modal */}
      {showSuccessModal && (
        <OnboardingSuccessModal countdown={countdown} ownReferral={ownReferral} bookingUrl={bookingUrl} />
      )}
    </div>
  );
}
