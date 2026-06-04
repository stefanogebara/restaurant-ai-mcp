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
import Step0Search from '../components/onboarding/Step0Search';
import Step1Welcome from '../components/onboarding/Step1Welcome';
import Step2Contact from '../components/onboarding/Step2Contact';
import Step3TablesAndSettings from '../components/onboarding/Step3TablesAndSettings';
import Step4Review from '../components/onboarding/Step4Review';
import Step5ImportHistory from '../components/onboarding/Step5ImportHistory';
import Step6TeachAI from '../components/onboarding/Step6TeachAI';
import OnboardingSuccessModal from '../components/onboarding/OnboardingSuccessModal';
import OnboardingStepSidebar from '../components/onboarding/OnboardingStepSidebar';
import type { OnboardingData } from '../types/onboarding.types';
import { applyScrapedData, type ScrapedRestaurant } from '../lib/applyScrapedData';
import { authFetch } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { trackOnboardingStepCompleted, trackOnboardingCompleted } from '../lib/analytics';
import { LS_CUSTOMER_EMAIL, LS_REFERRAL_CODE, LS_ONBOARDING_DATA, LS_ONBOARDING_STEP, LS_PENDING_DEMO_TOKEN } from '../config/localStorageKeys';
import { parseOnboardingError } from '../utils/onboardingErrorMessage';

const STEP_NAME_KEYS = ['onboarding.stepName1', 'onboarding.stepName2', 'onboarding.stepName3', 'onboarding.stepName4', 'onboarding.stepName5', 'onboarding.stepName6'];
const TOTAL_STEPS = 6;

export default function Onboarding() {
  const { t } = useTranslation();
  useDocumentTitle(t('pageTitles.onboarding'));
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { error: showError, success: showSuccessToast } = useToast();
  const { user } = useAuth();
  const showSubscribeBanner = searchParams.get('reason') === 'subscribe';
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Previously this was a bare boolean — the user saw "Setup failed" with no
  // explanation, no detail, and no way to know what to do. Now we keep the
  // actual server-side message so it can be surfaced inline.
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [ownReferral, setOwnReferral] = useState<{ code: string; url: string } | null>(null);
  const [bookingUrl, setBookingUrl] = useState<string | null>(null);
  // If the server tells us *which* field is bad we can offer a one-click jump
  // back to the step that owns it instead of making the owner hunt for it.
  const [submitErrorJumpStep, setSubmitErrorJumpStep] = useState<number | null>(null);

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

  // Step 0 (Google Places discovery) — runs BEFORE step 1 for fresh signups.
  // Two ways it's bypassed:
  //   1. Demo→signup converts get scraped_data from the demo restaurant via
  //      the prefill effect below; we mark step 0 done so they jump straight
  //      to Step 1 with everything already filled in.
  //   2. Anyone resuming a wizard mid-flight from localStorage (restored.step
  //      > 1) clearly already moved past step 0; don't show it again.
  //
  // The skip button on Step 0 also flips this so a brand-new restaurant with
  // no Google presence can proceed.
  const [step0Done, setStep0Done] = useState(restored.step > 1);
  const [hasPrefillFromScrape, setHasPrefillFromScrape] = useState(false);

  function applyAndAdvancePastStep0(scraped: ScrapedRestaurant) {
    setOnboardingData((prev) => ({ ...prev, ...applyScrapedData(scraped) }));
    setHasPrefillFromScrape(true);
    setStep0Done(true);
  }

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
    fetch(`${apiBase}/demo/session?token=${encodeURIComponent(demoToken)}`)
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
          // Pull richer fields from the persisted Google Places scrape so the
          // owner doesn't have to re-type info we already proved we know on
          // the demo dashboard (address, website, editorial summary, etc).
          // scraped_data is the same JSONB returned by /api/scrape-restaurant.
          const scraped = r.scraped_data && typeof r.scraped_data === 'object' ? r.scraped_data : null;
          if (scraped) {
            // Website: prefer scrape (canonical from Google) over user-typed.
            if (!updates.website && typeof scraped.website === 'string' && scraped.website) {
              updates.website = scraped.website;
            }
            // Phone fallback: if column was empty but scrape has it, use scrape.
            if (!updates.phone_number && typeof scraped.phone === 'string' && scraped.phone) {
              updates.phone_number = scraped.phone;
            }
            // Cuisine: scrape is more accurate than restaurant_type fallback
            // ('Restaurant' default) because Google Places types are specific.
            if (typeof scraped.cuisine_type === 'string' && scraped.cuisine_type
                && (!updates.restaurant_type || updates.restaurant_type.toLowerCase() === 'restaurant')) {
              updates.restaurant_type = scraped.cuisine_type;
            }
          }
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
        // Demo converts already went through Google Places when they created
        // the demo — skip Step 0 (search) and surface the same ✨ prefill
        // banner on Steps 1+2.
        setHasPrefillFromScrape(true);
        setStep0Done(true);
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

  // Cross-tab sync — without this, opening /onboarding in two tabs lets the
  // user advance Tab B to Step 4, submit, and create the restaurant, while
  // Tab A still shows Step 2 stale state. If they then click Continue in
  // Tab A, they submit outdated data on top of the just-created restaurant.
  //
  // Listen to `storage` events (only fire in OTHER tabs of the same origin):
  //   - LS_ONBOARDING_STEP removed (means another tab completed) → banner
  //     "You finished onboarding in another tab — reload to continue."
  //   - LS_ONBOARDING_STEP advanced past this tab's step → banner
  //     "Onboarding continued in another tab. Reload to sync."
  // Show a single dismissible banner. Do NOT auto-overwrite the user's
  // typed state — they might be intentionally editing in this tab.
  const [staleReason, setStaleReason] = useState<'completed' | 'advanced' | null>(null);
  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key !== LS_ONBOARDING_STEP) return;
      // Onboarding completed elsewhere — both LS keys get removed.
      if (e.newValue === null) {
        setStaleReason('completed');
        return;
      }
      const otherStep = parseInt(e.newValue, 10);
      if (Number.isFinite(otherStep) && otherStep > currentStep) {
        setStaleReason('advanced');
      }
    }
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [currentStep]);

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
        // Hand the structured response to parseOnboardingError so the user
        // gets a clean "Your phone number is required" instead of a
        // serialized "[object Object],[object Object]" or a raw Postgres
        // error like "22P02: invalid input value for enum restaurant_type".
        const parsed = parseOnboardingError(data, t);
        setSubmitErrorJumpStep(parsed.jumpToStep ?? null);
        throw new Error(parsed.message);
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
      const message = err instanceof Error
        ? err.message
        : t('onboarding.completeError', 'Failed to complete onboarding. Please try again.');
      showError(message);
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const progressPercent = (currentStep / TOTAL_STEPS) * 100;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Subscribe redirect banner */}
      {showSubscribeBanner && (
        <div className="bg-burgundy text-white text-[13px] text-center py-2.5 px-4">
          {t('onboarding.subscribeBanner')}
        </div>
      )}
      {/* Top Bar */}
      <header className="flex items-center justify-between px-6 sm:px-12 py-5 border-b border-glass-border-dark bg-glass-panel backdrop-blur-glass-nav">
        <div className="font-serif text-xl font-semibold text-deep-charcoal">
          seatable<span className="text-burgundy">.</span>
        </div>
        <div className="flex items-center gap-4">
          {step0Done && (
            <span className="text-[13px] text-warm-stone">{t('onboarding.stepOf', { current: currentStep, total: TOTAL_STEPS })}</span>
          )}
          <button
            type="button"
            onClick={() => {
              // Confirm to the user that their progress was actually persisted
              // — the previous version navigated away silently and Maria
              // didn't know whether she'd just lost everything.
              // Note: steps 1-4 are persisted by the `useEffect` that mirrors
              // `onboardingData` to localStorage; we just surface that fact.
              showSuccessToast(
                currentStep >= 5
                  ? t('onboarding.saveExitDone', 'Your restaurant is live. Finish the optional steps from your dashboard whenever you like.')
                  : t('onboarding.saveExitProgress', 'Progress saved — come back any time to finish.')
              );
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

      {/* Cross-tab staleness banner — fires when another tab advances or
          completes onboarding while this tab still shows older state.
          Reload syncs; Dismiss lets the user keep editing here (will
          overwrite the other tab's state on next save). */}
      {staleReason && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-center justify-between gap-4 flex-wrap" role="status">
          <p className="text-[13px] text-amber-900 font-medium">
            {staleReason === 'completed'
              ? t('onboarding.staleCompleted', 'You finished onboarding in another tab — reload to continue to your dashboard.')
              : t('onboarding.staleAdvanced', 'Onboarding continued in another tab. Reload to sync your progress.')}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-3 py-1.5 text-[12px] font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors"
            >
              {t('onboarding.staleReload', 'Reload')}
            </button>
            <button
              type="button"
              onClick={() => setStaleReason(null)}
              className="px-3 py-1.5 text-[12px] font-medium text-amber-900 hover:bg-amber-100 rounded-lg transition-colors"
            >
              {t('onboarding.staleDismiss', 'Dismiss')}
            </button>
          </div>
        </div>
      )}

      {/* Step 0 — Google Places discovery, shown before the wizard for
          fresh signups. Demo converts (scraped_data already on file) and
          resumed-mid-wizard sessions bypass this via step0Done=true. */}
      {!step0Done && (
        <div className="flex-1 flex max-w-[640px] mx-auto w-full px-6 sm:px-12 py-12">
          <div className="flex-1">
            <Step0Search
              onPrefill={(scraped) => applyAndAdvancePastStep0(scraped)}
              onSkip={() => setStep0Done(true)}
            />
          </div>
        </div>
      )}

      {step0Done && (
        <>
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
          {currentStep === 1 && (isPreFilledFromDemo || hasPrefillFromScrape) && (
            <div className="mb-5 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-burgundy/[0.06] border border-burgundy/20 text-[13px] text-burgundy font-medium">
              <ThiingsIcon name="sparkles" pxSize={15} />
              {isPreFilledFromDemo
                ? t('onboarding.prefilledFromDemo')
                : t('onboarding.prefilledStep1FromGoogle', 'Restaurant info pulled from Google Maps — confirm or edit below.')}
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
          {currentStep === 2 && (isPreFilledFromDemo || hasPrefillFromScrape) && (
            <div className="mb-5 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-burgundy/[0.06] border border-burgundy/20 text-[13px] text-burgundy font-medium">
              <ThiingsIcon name="sparkles" pxSize={15} />
              {t('onboarding.prefilledStep2')}
            </div>
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
            <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-red-800">{t('onboarding.setupFailed')}</p>
                  {/* The previous version showed the friendly "Setup failed"
                      banner with NO indication of what actually went wrong.
                      Maria would click Try Again, hit the same error, and
                      give up. Surface the server message inline. */}
                  <p className="mt-1 text-xs text-red-700 break-words whitespace-pre-wrap">{submitError}</p>
                </div>
                <div className="flex flex-col gap-2 flex-shrink-0">
                  {/* When the backend tells us WHICH step has the bad field,
                      offer a single-click jump. The user otherwise has to
                      mentally map "Your phone is invalid" → "that lives on
                      Step 2" → click Edit on the right Review row. */}
                  {submitErrorJumpStep && submitErrorJumpStep !== currentStep && (
                    <button
                      type="button"
                      onClick={() => {
                        const stepToVisit = submitErrorJumpStep;
                        setSubmitError(null);
                        setSubmitErrorJumpStep(null);
                        goToStep(stepToVisit);
                      }}
                      className="px-4 py-2 bg-white/70 backdrop-blur-glass-chip border border-red-300 text-red-700 text-sm font-medium rounded-lg hover:bg-red-50"
                    >
                      {t('onboarding.fixOnStep', 'Fix on step {{step}}', { step: submitErrorJumpStep })}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { setSubmitError(null); setSubmitErrorJumpStep(null); completeOnboarding(); }}
                    className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700"
                  >
                    {t('onboarding.tryAgain')}
                  </button>
                </div>
              </div>
              {/* Human escape hatch — if Try Again keeps failing, Maria needs
                  a path to a real person, not just "try again". */}
              <p className="text-xs text-red-700/80">
                {t('onboarding.setupFailedSupport', 'Still stuck?')}{' '}
                <a
                  href="mailto:hello@seatable.one?subject=Setup%20stuck"
                  className="font-semibold underline hover:no-underline"
                >
                  hello@seatable.one
                </a>{' '}
                {t('onboarding.setupFailedSupportSuffix', "— we'll get you set up in minutes.")}
              </p>
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
        </>
      )}

      {/* Success Modal */}
      {showSuccessModal && (
        <OnboardingSuccessModal countdown={countdown} ownReferral={ownReferral} bookingUrl={bookingUrl} />
      )}
    </div>
  );
}
