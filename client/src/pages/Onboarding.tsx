/**
 * Restaurant Onboarding Wizard
 *
 * 5-step onboarding flow for new restaurant customers:
 * 1. Welcome & Restaurant Info
 * 2. Contact & Business Hours
 * 3. Table Configuration
 * 4. Reservation Settings
 * 5. Team Setup (Pro+ only)
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import Step1Welcome from '../components/onboarding/Step1Welcome';
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

  // Get customer email from subscription (passed via URL params after Stripe checkout)
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
      { name: 'Indoor', is_active: true, tables: [] }
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
    if (currentStep < 5) {
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

      if (!response.ok) {
        throw new Error('Failed to complete onboarding');
      }

      // Clear localStorage
      localStorage.removeItem('onboarding_data');
      localStorage.removeItem('onboarding_step');

      success('🎉 Welcome to HostGenius! Your restaurant is all set up.');

      // Redirect to dashboard
      setTimeout(() => {
        navigate('/host-dashboard');
      }, 2000);
    } catch (err) {
      showError('Failed to complete onboarding. Please try again.');
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Progress bar percentage
  const progressPercentage = (currentStep / 5) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center p-6">
      <div className="w-full max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8">
          <motion.h1
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl font-bold text-white mb-2"
          >
            Welcome to HostGenius
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-lg text-purple-200"
          >
            Let's set up your restaurant in under 5 minutes!
          </motion.p>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-purple-200">
              Step {currentStep} of 5
            </span>
            <span className="text-sm font-semibold text-purple-200">
              {Math.round(progressPercentage)}% Complete
            </span>
          </div>
          <div className="h-3 bg-white/10 rounded-full overflow-hidden backdrop-blur-sm">
            <motion.div
              className="h-full bg-gradient-to-r from-emerald-400 to-cyan-400"
              initial={{ width: 0 }}
              animate={{ width: `${progressPercentage}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>

        {/* Step Content */}
        <motion.div
          className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20 shadow-2xl"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
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
              <Step2Contact
                key="step2"
                data={onboardingData}
                updateData={updateData}
                onNext={nextStep}
                onBack={prevStep}
              />
            )}
            {currentStep === 3 && (
              <Step3Tables
                key="step3"
                data={onboardingData}
                updateData={updateData}
                onNext={nextStep}
                onBack={prevStep}
              />
            )}
            {currentStep === 4 && (
              <Step4Settings
                key="step4"
                data={onboardingData}
                updateData={updateData}
                onNext={nextStep}
                onBack={prevStep}
              />
            )}
            {currentStep === 5 && (
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
        </motion.div>

        {/* Help Text */}
        <div className="text-center mt-6">
          <p className="text-sm text-purple-200">
            Need help? {' '}
            <a href="mailto:support@hostgenius.com" className="text-cyan-300 hover:text-cyan-200 font-semibold underline">
              Contact Support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
