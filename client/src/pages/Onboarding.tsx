/**
 * Restaurant Onboarding Wizard - Modern Elegant Design
 *
 * 7-step onboarding flow for new restaurant customers:
 * 1. Welcome & Restaurant Info
 * 2. AI Learning (research + interview + persona)
 * 3. Contact & Business Hours
 * 4. AI Voice Selection (choose ElevenLabs voice for phone agent)
 * 5. Table Configuration
 * 6. Reservation Settings
 * 7. Team Setup (Pro+ only)
 *
 * Design: Modern Elegant with warm white backgrounds, burgundy accents,
 * Playfair Display headings, and clean minimalist aesthetic
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import Step1Welcome from '../components/onboarding/Step1Welcome';
import Step1_5RestaurantLearning from '../components/onboarding/Step1_5RestaurantLearning';
import Step2Contact from '../components/onboarding/Step2Contact';
import Step2_5VoiceSelection from '../components/onboarding/Step2_5VoiceSelection';
import Step3Tables from '../components/onboarding/Step3Tables';
import Step4Settings from '../components/onboarding/Step4Settings';
import Step5Team from '../components/onboarding/Step5Team';
import type { OnboardingData } from '../types/onboarding.types';
import { authFetch } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

export default function Onboarding() {
  const navigate = useNavigate();
  const { error: showError } = useToast();
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Get customer email from auth context (no longer requires URL params or Stripe checkout)
  const customerEmail = user?.email || localStorage.getItem('customer_email') || '';

  // Onboarding data state
  const [onboardingData, setOnboardingData] = useState<OnboardingData>({
    customer_email: customerEmail,
    restaurant_id: '',
    plan: 'Professional',
    // Step 1: Welcome & Restaurant Info
    restaurant_name: '',
    restaurant_type: '',
    city: '',
    country: '',
    // Step 2: Contact & Business Hours
    phone_number: '',
    email: '',
    website: '',
    // Default: Lunch & Dinner service (most common restaurant schedule)
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
    // Step 3: Table Configuration
    areas: [
      {
        name: 'Indoor',
        is_active: true,
        tables: [
          { capacity: 2, count: 0, shape: 'square', is_fixed_seating: false, is_joinable: true },
          { capacity: 4, count: 0, shape: 'square', is_fixed_seating: false, is_joinable: true },
          { capacity: 6, count: 0, shape: 'square', is_fixed_seating: false, is_joinable: true },
          { capacity: 8, count: 0, shape: 'square', is_fixed_seating: false, is_joinable: true }
        ]
      }
    ],
    // Step 4: Reservation Settings
    advance_booking_days: 30,
    buffer_time: 15,
    cancellation_policy: 'Free cancellation up to 2 hours before reservation',
    special_notes: '',
    // Step 5: Team Setup
    team_members: [],
  });

  // Save progress to localStorage
  useEffect(() => {
    localStorage.setItem('onboarding_data', JSON.stringify(onboardingData));
    localStorage.setItem('onboarding_step', currentStep.toString());
  }, [onboardingData, currentStep]);

  // Update onboarding data
  const updateData = (updates: Partial<OnboardingData>) => {
    setOnboardingData((prev) => ({ ...prev, ...updates }));
  };

  // Navigate to next step
  const nextStep = () => {
    if (currentStep < 7) {
      setCurrentStep(currentStep + 1);
    }
  };

  // Navigate to previous step
  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Complete onboarding
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

      // Clear localStorage
      localStorage.removeItem('onboarding_data');
      localStorage.removeItem('onboarding_step');

      // Show success modal
      setShowSuccessModal(true);

      // Redirect to dashboard after 3 seconds
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

  // Step metadata for progress bar
  const stepNames = [
    'Restaurant Info',
    'AI Learning',
    'Contact & Hours',
    'Voice Selection',
    'Tables',
    'Settings',
    'Team'
  ];

  return (
    <div className="min-h-screen bg-[#FAFAF9] relative overflow-hidden">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#E7E5E4] rounded-full blur-3xl opacity-40" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#E7E5E4] rounded-full blur-3xl opacity-30" />
      </div>

      {/* Content Container */}
      <div className="relative z-10">
        {/* Header with Progress Bar */}
        <div className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-[#E7E5E4]">
          <div className="max-w-4xl mx-auto px-6 py-4">
            {/* Logo and Step Counter */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h1 className="font-serif text-2xl font-bold text-[#1C1917]">
                  Seatable<span className="text-[#9F1239]">.</span>
                </h1>
              </div>
              <div className="text-sm text-[#57534E] font-medium">
                Step {currentStep} of 7
              </div>
            </div>

            {/* Progress Steps */}
            <div className="flex items-center">
              {stepNames.map((name, index) => {
                const stepNumber = index + 1;
                const isActive = stepNumber === currentStep;
                const isCompleted = stepNumber < currentStep;
                const isLast = index === stepNames.length - 1;

                return (
                  <div key={stepNumber} className="flex items-center flex-1 last:flex-none">
                    {/* Step Circle + Label */}
                    <div className="flex flex-col items-center gap-1">
                      <div
                        className={`
                          w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300
                          ${isCompleted
                            ? 'bg-[#9F1239] text-white'
                            : isActive
                              ? 'bg-[#9F1239] text-white ring-4 ring-[#9F1239]/20'
                              : 'bg-[#E7E5E4] text-[#A8A29E]'
                          }
                        `}
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
                        className={`
                          hidden md:block text-[10px] font-medium transition-colors duration-300 whitespace-nowrap
                          ${isActive ? 'text-[#9F1239]' : isCompleted ? 'text-[#1C1917]' : 'text-[#A8A29E]'}
                        `}
                      >
                        {name}
                      </span>
                    </div>
                    {/* Connecting Line */}
                    {!isLast && (
                      <div className={`flex-1 h-0.5 mx-1.5 transition-colors duration-500 ${isCompleted ? 'bg-[#9F1239]' : 'bg-[#E7E5E4]'}`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Step Content - With top padding for fixed header */}
        <div className="pt-32 pb-12 px-6">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-4xl mx-auto"
          >
            <div className="
              bg-white
              border border-[#E7E5E4]
              rounded-[2rem]
              p-8 md:p-12
              shadow-xl shadow-black/5
            "
            >
              <AnimatePresence mode="wait">
                {currentStep === 1 && (
                  <Step1Welcome
                    key="step1"
                    data={onboardingData}
                    updateData={updateData}
                    onNext={nextStep}
                  />
                )}
                {currentStep === 2 && (
                  <Step1_5RestaurantLearning
                    key="step1.5"
                    data={onboardingData}
                    updateData={updateData}
                    onNext={nextStep}
                    onBack={prevStep}
                  />
                )}
                {currentStep === 3 && (
                  <Step2Contact
                    key="step2"
                    data={onboardingData}
                    updateData={updateData}
                    onNext={nextStep}
                    onBack={prevStep}
                  />
                )}
                {currentStep === 4 && (
                  <Step2_5VoiceSelection
                    key="step2.5"
                    data={onboardingData}
                    onUpdate={updateData}
                    onNext={nextStep}
                    onPrev={prevStep}
                  />
                )}
                {currentStep === 5 && (
                  <Step3Tables
                    key="step3"
                    data={onboardingData}
                    updateData={updateData}
                    onNext={nextStep}
                    onBack={prevStep}
                  />
                )}
                {currentStep === 6 && (
                  <Step4Settings
                    key="step4"
                    data={onboardingData}
                    updateData={updateData}
                    onNext={nextStep}
                    onBack={prevStep}
                  />
                )}
                {currentStep === 7 && (
                  <Step5Team
                    key="step5"
                    data={onboardingData}
                    updateData={updateData}
                    onComplete={completeOnboarding}
                    onBack={prevStep}
                    isSubmitting={isSubmitting}
                  />
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* Help Text */}
          <div className="text-center mt-6 max-w-4xl mx-auto">
            <p className="text-sm text-[#57534E]">
              Need help?{' '}
              <a
                href="mailto:stefanogebara@gmail.com"
                className="text-[#9F1239] hover:text-[#881337] font-semibold transition-colors"
              >
                Contact Support
              </a>
            </p>
          </div>
        </div>
      </div>

      {/* Success Modal */}
      <AnimatePresence>
        {showSuccessModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
              className="
                bg-white
                border border-[#E7E5E4]
                rounded-[2rem]
                p-12
                max-w-md
                w-full
                shadow-2xl
              "
            >
              <div className="text-center">
                {/* Success Icon */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                  className="
                    w-20 h-20
                    bg-[#9F1239]
                    rounded-full
                    flex items-center justify-center
                    mx-auto mb-6
                  "
                >
                  <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </motion.div>

                {/* Success Message */}
                <motion.h2
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="
                    font-serif text-3xl font-bold
                    text-[#1C1917]
                    mb-3
                  "
                >
                  Welcome Aboard!
                </motion.h2>

                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="
                    text-base
                    text-[#57534E]
                    mb-6
                  "
                >
                  Your restaurant is ready. Let's start managing reservations!
                </motion.p>

                {/* Loading Animation */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="flex items-center justify-center gap-2"
                >
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-[#E7E5E4] border-t-[#9F1239]"></div>
                  <span className="text-sm text-[#57534E]">
                    Redirecting to dashboard...
                  </span>
                </motion.div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
