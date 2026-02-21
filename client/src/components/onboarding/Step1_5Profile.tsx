/**
 * Step 1.5: Restaurant Profile Questionnaire
 *
 * Optional step between Welcome and Contact that collects
 * restaurant characteristics for dashboard customization.
 */

import { motion } from 'framer-motion';
import type { OnboardingStepProps } from '../../types/onboarding.types';
import type { ProfileQuestionnaireData } from '../../types/profile.types';
import RestaurantProfileQuestionnaire from './RestaurantProfileQuestionnaire';
export default function Step1_5Profile({ data, updateData, onNext, onBack }: OnboardingStepProps) {
  const handleProfileComplete = (profileData: ProfileQuestionnaireData) => {
    updateData({ profile_data: profileData });
    if (onNext) {
      onNext();
    }
  };

  const handleSkip = () => {
    // Skip profile setup - use defaults
    updateData({ profile_data: undefined });
    if (onNext) {
      onNext();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-[#1C1917] mb-2">
          Customize Your Dashboard Experience
        </h2>
        <p className="text-[#57534E] text-sm">
          Tell us about your restaurant so we can tailor the dashboard to your needs
        </p>
        <p className="text-[#A8A29E] text-xs mt-2">
          (Optional - you can skip this and customize later in Settings)
        </p>
      </div>

      {/* Questionnaire */}
      <RestaurantProfileQuestionnaire
        onComplete={handleProfileComplete}
        onSkip={handleSkip}
        initialData={data.profile_data}
      />

      {/* Back Button */}
      <div className="flex justify-start pt-4 border-t border-[#E7E5E4] mt-8">
        <button
          type="button"
          onClick={onBack}
          className="px-6 py-3 bg-white hover:bg-[#F5F5F4] border border-[#E7E5E4] text-[#1C1917] font-semibold rounded-xl flex items-center gap-2 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Restaurant Info
        </button>
      </div>
    </motion.div>
  );
}
