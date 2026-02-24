/**
 * Restaurant Onboarding Wizard - Simplified 4-Step Flow
 *
 * 1. Restaurant Info    — name, type, location, language
 * 2. Contact & Hours   — phone, email, WhatsApp, business hours
 * 3. Tables & Settings — dining areas + booking settings (collapsed)
 * 4. Review & Launch   — summary with edit links, then submit
 *
 * AI Learning, Voice Selection, and Team Setup have been moved
 * to post-onboarding settings to reduce friction.
 */

import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ThiingsIcon from '../components/common/ThiingsIcon';
import { useTranslation } from 'react-i18next';
import { useToast } from '../contexts/ToastContext';
import Step1Welcome from '../components/onboarding/Step1Welcome';
import Step2Contact from '../components/onboarding/Step2Contact';
import Step3TablesAndSettings from '../components/onboarding/Step3TablesAndSettings';
import Step4Review from '../components/onboarding/Step4Review';
import type { OnboardingData } from '../types/onboarding.types';
import { authFetch } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { trackOnboardingStepCompleted, trackOnboardingCompleted } from '../lib/analytics';

const STEP_NAME_KEYS = ['onboarding.stepName1', 'onboarding.stepName2', 'onboarding.stepName3', 'onboarding.stepName4'];
const TOTAL_STEPS = 4;

export default function Onboarding() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { error: showError } = useToast();
  const { user } = useAuth();
  const { t } = useTranslation();
  const showSubscribeBanner = searchParams.get('reason') === 'subscribe';
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [ownReferral, setOwnReferral] = useState<{ code: string; url: string } | null>(null);

  const customerEmail = user?.email || localStorage.getItem('customer_email') || '';

  const [onboardingData, setOnboardingData] = useState<OnboardingData>({
    customer_email: customerEmail,
    restaurant_id: '',
    plan: 'Professional',
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
        name: 'Indoor',
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
    cancellation_policy: 'Free cancellation up to 2 hours before reservation',
    special_notes: '',
    // Team setup moved to Settings post-onboarding
    team_members: [],
  });

  // Persist progress
  useEffect(() => {
    localStorage.setItem('onboarding_data', JSON.stringify(onboardingData));
    localStorage.setItem('onboarding_step', currentStep.toString());
  }, [onboardingData, currentStep]);

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
        const errorMessage = data.message || data.error || 'Failed to complete onboarding';
        const errorDetails = data.details ? `\n\nDetails: ${data.details}` : '';
        throw new Error(`${errorMessage}${errorDetails}`);
      }

      // Attach any referral code that was captured at sign-up (fire-and-forget)
      const pendingReferralCode = localStorage.getItem('referral_code');
      if (pendingReferralCode) {
        authFetch('/api/referral?action=attach', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ referral_code: pendingReferralCode }),
        }).catch((err) => {
          console.warn('[Onboarding] Failed to attach referral code:', err);
        });
      }

      localStorage.removeItem('onboarding_data');
      localStorage.removeItem('onboarding_step');
      localStorage.removeItem('referral_code');

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
          setTimeout(() => {
            navigate('/host-dashboard/simple');
          }, 10000);
        })
        .catch(() => {
          /* best-effort */
          setTimeout(() => {
            navigate('/host-dashboard/simple');
          }, 10000);
        });

      setShowSuccessModal(true);
    } catch (err: any) {
      showError(err.message || 'Failed to complete onboarding. Please try again.');
      console.error('[Onboarding Error]', err);
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
            onClick={() => navigate('/')}
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

      {/* Layout */}
      <div className="flex-1 flex max-w-[1000px] mx-auto w-full px-6 sm:px-12 py-12 gap-16">
        {/* Step Sidebar */}
        <div className="hidden md:block flex-shrink-0 w-[220px] pt-2">
          <div className="flex flex-col">
            {STEP_NAME_KEYS.map((key, index) => {
              const name = t(key);
              const stepNumber = index + 1;
              const isActive = stepNumber === currentStep;
              const isCompleted = stepNumber < currentStep;
              const isLast = index === STEP_NAME_KEYS.length - 1;

              return (
                <div key={stepNumber} className="flex items-start gap-4 py-4 relative">
                  {!isLast && (
                    <div
                      className={`absolute left-[15px] top-[48px] bottom-0 w-px ${
                        isCompleted
                          ? 'bg-burgundy'
                          : isActive
                            ? 'bg-gradient-to-b from-burgundy to-border-gray'
                            : 'bg-border-gray'
                      }`}
                    />
                  )}
                  <div
                    className={`relative z-10 w-8 h-8 rounded-full border-2 flex items-center justify-center text-[13px] font-semibold flex-shrink-0 ${
                      isCompleted
                        ? 'border-burgundy bg-burgundy text-white'
                        : isActive
                          ? 'border-burgundy bg-burgundy/[0.06] text-burgundy'
                          : 'border-border-gray bg-white text-muted-stone'
                    }`}
                  >
                    {isCompleted ? (
                      <ThiingsIcon name="check" pxSize={14} />
                    ) : (
                      stepNumber
                    )}
                  </div>
                  <span
                    className={`text-sm pt-[5px] ${
                      isActive
                        ? 'font-semibold text-deep-charcoal'
                        : isCompleted
                          ? 'font-medium text-stone-gray'
                          : 'font-medium text-muted-stone'
                    }`}
                  >
                    {name}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Form Content */}
        <div className="flex-1 max-w-[480px]">
          {currentStep === 1 && (
            <Step1Welcome
              data={onboardingData}
              updateData={updateData}
              onNext={nextStep}
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
        </div>
      </div>

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-white border border-border-gray rounded-2xl p-10 max-w-md w-full">
            <div className="text-center">
              <div className="w-20 h-20 bg-burgundy rounded-full flex items-center justify-center mx-auto mb-6">
                <ThiingsIcon name="check" pxSize={40} className="text-white" />
              </div>
              <h2 className="font-serif text-3xl font-medium text-deep-charcoal mb-3">{t('onboarding.welcomeAboard')}</h2>
              <p className="text-[15px] text-stone-gray font-light mb-6">
                {t('onboarding.restaurantReady')}
              </p>

              {/* Referral share nudge */}
              {ownReferral && (() => {
                const referralUrl = ownReferral.url;
                const whatsappText = encodeURIComponent(`I just joined Seatable – the AI that manages restaurant reservations. Try it free: ${referralUrl}`);
                const emailSubject = encodeURIComponent('Try Seatable – AI reservations for restaurants');
                const emailBody = encodeURIComponent(`Hey,\n\nI just started using Seatable – it handles restaurant reservations with AI. Thought you might find it useful.\n\nTry it free here: ${referralUrl}\n\nCheers`);
                return (
                  <div className="mb-6 border border-border-gray rounded-2xl p-4">
                    <p className="text-[13px] font-medium text-deep-charcoal mb-3">
                      Know another restaurateur? Share Seatable and earn rewards.
                    </p>
                    <div className="flex gap-3 justify-center">
                      <a
                        href={`https://wa.me/?text=${whatsappText}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#25D366] text-white text-[13px] font-medium hover:bg-[#1ebe5d] transition-colors"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                        </svg>
                        WhatsApp
                      </a>
                      <a
                        href={`mailto:?subject=${emailSubject}&body=${emailBody}`}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-deep-charcoal text-white text-[13px] font-medium hover:bg-charcoal-dark transition-colors"
                      >
                        <ThiingsIcon name="mail" pxSize={16} />
                        Email
                      </a>
                    </div>
                  </div>
                );
              })()}

              <div className="flex items-center justify-center gap-2 mb-4">
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-border-gray border-t-burgundy" />
                <span className="text-sm text-stone-gray">{t('onboarding.redirectingToDashboard')}</span>
              </div>

              <button
                onClick={() => navigate('/host-dashboard/simple')}
                className="text-[13px] font-medium text-burgundy hover:text-burgundy-dark transition-colors underline underline-offset-2"
              >
                Go to Dashboard &rarr;
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
