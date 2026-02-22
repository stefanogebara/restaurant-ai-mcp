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
import { useToast } from '../contexts/ToastContext';
import Step1Welcome from '../components/onboarding/Step1Welcome';
import Step2Contact from '../components/onboarding/Step2Contact';
import Step3TablesAndSettings from '../components/onboarding/Step3TablesAndSettings';
import Step4Review from '../components/onboarding/Step4Review';
import type { OnboardingData } from '../types/onboarding.types';
import { authFetch } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { trackOnboardingStepCompleted, trackOnboardingCompleted } from '../lib/analytics';

const STEP_NAMES = ['Restaurant Info', 'Contact & Hours', 'Tables & Settings', 'Review & Launch'];
const TOTAL_STEPS = 4;

export default function Onboarding() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { error: showError } = useToast();
  const { user } = useAuth();
  const showSubscribeBanner = searchParams.get('reason') === 'subscribe';
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

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
      trackOnboardingStepCompleted({ step: currentStep, step_name: STEP_NAMES[currentStep - 1] });
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

      localStorage.removeItem('onboarding_data');
      localStorage.removeItem('onboarding_step');

      trackOnboardingCompleted({
        plan: onboardingData.plan ?? 'unknown',
        country: onboardingData.country,
        restaurant_type: onboardingData.restaurant_type,
      });

      setShowSuccessModal(true);

      setTimeout(() => {
        navigate('/host-dashboard');
      }, 3000);
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
          Complete your restaurant setup first, then you can choose a plan.
        </div>
      )}
      {/* Top Bar */}
      <header className="flex items-center justify-between px-6 sm:px-12 py-5 border-b border-border-gray bg-white">
        <div className="font-serif text-xl font-semibold text-deep-charcoal">
          seatable<span className="text-burgundy">.</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[13px] text-warm-stone">Step {currentStep} of {TOTAL_STEPS}</span>
          <button
            onClick={() => navigate('/')}
            className="text-[13px] text-burgundy font-medium hover:text-burgundy-dark transition-colors"
          >
            Save &amp; Exit
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
            {STEP_NAMES.map((name, index) => {
              const stepNumber = index + 1;
              const isActive = stepNumber === currentStep;
              const isCompleted = stepNumber < currentStep;
              const isLast = index === STEP_NAMES.length - 1;

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
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
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
          <div className="bg-white border border-border-gray rounded-2xl p-12 max-w-md w-full">
            <div className="text-center">
              <div className="w-20 h-20 bg-burgundy rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="font-serif text-3xl font-medium text-deep-charcoal mb-3">Welcome Aboard!</h2>
              <p className="text-[15px] text-stone-gray font-light mb-6">
                Your restaurant is ready. Let&apos;s start managing reservations!
              </p>
              <div className="flex items-center justify-center gap-2">
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-border-gray border-t-burgundy" />
                <span className="text-sm text-stone-gray">Redirecting to dashboard...</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
