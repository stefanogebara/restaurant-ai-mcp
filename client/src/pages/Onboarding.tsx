/**
 * Restaurant Onboarding Wizard - Premium Restaurant Design
 *
 * 6-step onboarding flow for new restaurant customers:
 * 1. Welcome & Restaurant Info
 * 2. Dashboard Profile (customize metrics & preferences)
 * 3. Contact & Business Hours
 * 4. Table Configuration
 * 5. Reservation Settings
 * 6. Team Setup (Pro+ only)
 *
 * Design: Premium restaurant aesthetic with burgundy/gold palette,
 * Playfair Display headings, and cream/parchment backgrounds
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import Step1Welcome from '../components/onboarding/Step1Welcome';
import Step1_5Profile from '../components/onboarding/Step1_5Profile';
import Step2Contact from '../components/onboarding/Step2Contact';
import Step3Tables from '../components/onboarding/Step3Tables';
import Step4Settings from '../components/onboarding/Step4Settings';
import Step5Team from '../components/onboarding/Step5Team';
import type { OnboardingData } from '../types/onboarding.types';

export default function Onboarding() {
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Get customer email and plan from subscription (passed via URL params after Stripe checkout)
  const urlParams = new URLSearchParams(window.location.search);
  const customerEmail = urlParams.get('email') || localStorage.getItem('customer_email') || '';
  const restaurantId = urlParams.get('restaurant_id') || localStorage.getItem('restaurant_id') || '';

  // Onboarding data state
  const [onboardingData, setOnboardingData] = useState<OnboardingData>({
    customer_email: customerEmail,
    restaurant_id: restaurantId,
    // Step 1: Welcome & Restaurant Info
    restaurant_name: '',
    restaurant_type: '',
    city: '',
    country: '',
    // Step 2: Contact & Business Hours
    phone_number: '',
    email: '',
    website: '',
    business_hours: [
      { day: 'Monday', is_open: true, open_time: '09:00', close_time: '22:00' },
      { day: 'Tuesday', is_open: true, open_time: '09:00', close_time: '22:00' },
      { day: 'Wednesday', is_open: true, open_time: '09:00', close_time: '22:00' },
      { day: 'Thursday', is_open: true, open_time: '09:00', close_time: '22:00' },
      { day: 'Friday', is_open: true, open_time: '09:00', close_time: '23:00' },
      { day: 'Saturday', is_open: true, open_time: '09:00', close_time: '23:00' },
      { day: 'Sunday', is_open: true, open_time: '10:00', close_time: '21:00' },
    ],
    average_dining_duration: 90,
    // Step 3: Table Configuration
    areas: [
      {
        name: 'Indoor',
        is_active: true,
        tables: [
          { capacity: 2, count: 0 },
          { capacity: 4, count: 0 },
          { capacity: 6, count: 0 },
          { capacity: 8, count: 0 }
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
    if (currentStep < 6) {
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
      const response = await fetch('/api/onboarding/complete', {
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
    'Dashboard Profile',
    'Contact & Hours',
    'Tables',
    'Settings',
    'Team'
  ];

  return (
    <div className="min-h-screen bg-[#F5F5DC] relative overflow-hidden">
      {/* Parchment texture background */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ebe9d5' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }}
      />

      {/* Mesh gradient overlay */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `
            radial-gradient(at 40% 20%, rgba(125, 17, 40, 0.3) 0px, transparent 50%),
            radial-gradient(at 80% 0%, rgba(212, 175, 55, 0.3) 0px, transparent 50%),
            radial-gradient(at 0% 50%, rgba(43, 43, 43, 0.2) 0px, transparent 50%),
            radial-gradient(at 80% 50%, rgba(125, 17, 40, 0.2) 0px, transparent 50%),
            radial-gradient(at 0% 100%, rgba(212, 175, 55, 0.3) 0px, transparent 50%),
            radial-gradient(at 80% 100%, rgba(125, 17, 40, 0.2) 0px, transparent 50%)
          `
        }}
      />

      {/* Content Container */}
      <div className="relative z-10">
        {/* Header with Progress Bar */}
        <div className="fixed top-0 left-0 right-0 z-50 bg-[#fdfcf6]/80 backdrop-blur-xl border-b-2 border-[#ebe9d5]">
          <div className="max-w-4xl mx-auto px-6 py-4">
            {/* Logo and Step Counter */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🍽️</span>
                <h1 className="font-['Playfair_Display'] font-bold text-xl text-[#7D1128]">
                  RestaurantAI Setup
                </h1>
              </div>
              <div className="font-['IBM_Plex_Sans'] text-sm text-[#5d5d5d] font-medium">
                Step {currentStep} of 6
              </div>
            </div>

            {/* Progress Steps */}
            <div className="flex items-center gap-2">
              {stepNames.map((name, index) => {
                const stepNumber = index + 1;
                const isActive = stepNumber === currentStep;
                const isCompleted = stepNumber < currentStep;

                return (
                  <div key={stepNumber} className="flex-1 flex flex-col gap-1">
                    <div
                      className={`
                        h-2 rounded-full transition-all duration-500 ease-out
                        ${isCompleted || isActive
                          ? 'bg-gradient-to-r from-[#ad1e47] to-[#7D1128] shadow-lg shadow-[#7D1128]/30'
                          : 'bg-[#ddd9c0]'
                        }
                      `}
                    />
                    {/* Step label on desktop */}
                    <span
                      className={`
                        hidden md:block text-[10px] font-['IBM_Plex_Sans'] font-medium transition-colors duration-300
                        ${isActive ? 'text-[#7D1128]' : isCompleted ? 'text-[#4A7C59]' : 'text-[#888888]'}
                      `}
                    >
                      {name}
                    </span>
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
              bg-[#fefdfb]
              border-2 border-[#ddd9c0]
              rounded-2xl
              p-8 md:p-12
              shadow-2xl
            "
            style={{
              boxShadow: '0 25px 50px -12px rgba(125, 17, 40, 0.25)'
            }}
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
                  <Step1_5Profile
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
                  <Step3Tables
                    key="step3"
                    data={onboardingData}
                    updateData={updateData}
                    onNext={nextStep}
                    onBack={prevStep}
                  />
                )}
                {currentStep === 5 && (
                  <Step4Settings
                    key="step4"
                    data={onboardingData}
                    updateData={updateData}
                    onNext={nextStep}
                    onBack={prevStep}
                  />
                )}
                {currentStep === 6 && (
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
            <p className="font-['IBM_Plex_Sans'] text-sm text-[#6d6d6d]">
              Need help?{' '}
              <a
                href="mailto:support@hostgenius.com"
                className="text-[#7D1128] hover:text-[#ad1e47] font-semibold underline transition-colors"
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
            className="fixed inset-0 bg-[#2B2B2B]/50 backdrop-blur-sm z-50 flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
              className="
                bg-[#fefdfb]
                border-2 border-[#D4AF37]
                rounded-2xl
                p-12
                max-w-md
                w-full
                shadow-2xl
              "
              style={{
                boxShadow: '0 20px 25px -5px rgba(212, 175, 55, 0.3), 0 10px 10px -5px rgba(212, 175, 55, 0.2)'
              }}
            >
              <div className="text-center">
                {/* Success Icon */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                  className="
                    w-20 h-20
                    bg-gradient-to-br from-[#fad24e] to-[#D4AF37]
                    rounded-full
                    flex items-center justify-center
                    mx-auto mb-6
                  "
                  style={{
                    boxShadow: '0 20px 25px -5px rgba(212, 175, 55, 0.3), 0 10px 10px -5px rgba(212, 175, 55, 0.2)'
                  }}
                >
                  <span className="text-5xl">🎉</span>
                </motion.div>

                {/* Success Message */}
                <motion.h2
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="
                    font-['Playfair_Display'] font-bold text-3xl
                    text-[#7D1128]
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
                    font-['IBM_Plex_Sans'] text-base
                    text-[#4f4f4f]
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
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-[#ddd9c0] border-t-[#7D1128]"></div>
                  <span className="font-['IBM_Plex_Sans'] text-sm text-[#6d6d6d]">
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
