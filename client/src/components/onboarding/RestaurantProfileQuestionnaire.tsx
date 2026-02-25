/**
 * Restaurant Profile Questionnaire
 *
 * Multi-step questionnaire to determine optimal dashboard configuration
 * based on restaurant characteristics and owner preferences.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useForm } from 'react-hook-form';
import type { ProfileQuestionnaireData } from '../../types/profile.types';
import QuestionnaireStep1 from './QuestionnaireStep1';
import QuestionnaireStep2 from './QuestionnaireStep2';
import QuestionnaireStep3 from './QuestionnaireStep3';
import QuestionnaireStep4 from './QuestionnaireStep4';

interface RestaurantProfileQuestionnaireProps {
  onComplete: (data: ProfileQuestionnaireData) => void;
  onSkip?: () => void;
  initialData?: Partial<ProfileQuestionnaireData>;
}

export default function RestaurantProfileQuestionnaire({
  onComplete,
  onSkip,
  initialData = {},
}: RestaurantProfileQuestionnaireProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const { register, watch, setValue, handleSubmit } = useForm<ProfileQuestionnaireData>({
    defaultValues: initialData,
    mode: 'onChange',
  });

  const restaurant_type = watch('restaurant_type');
  const size = watch('size');
  const seat_count = watch('seat_count');
  const location_type = watch('location_type');
  const primary_concerns = watch('primary_concerns') || [];
  const template = watch('template');

  const totalSteps = 4;
  const goNext = () => { if (currentStep < totalSteps) setCurrentStep(currentStep + 1); };
  const goPrev = () => { if (currentStep > 1) setCurrentStep(currentStep - 1); };

  return (
    <form onSubmit={handleSubmit(onComplete)} className="w-full">
      {/* Progress */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-stone-gray">
            Profile Setup: Step {currentStep} of {totalSteps}
          </span>
          <span className="text-sm font-semibold text-stone-gray">
            {Math.round((currentStep / totalSteps) * 100)}% Complete
          </span>
        </div>
        <div className="h-2 bg-soft-gray rounded-full overflow-hidden border border-border-gray">
          <motion.div
            className="h-full bg-burgundy rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${(currentStep / totalSteps) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      <AnimatePresence mode="wait">
        {currentStep === 1 && (
          <QuestionnaireStep1
            restaurantType={restaurant_type}
            setValue={setValue}
            onNext={goNext}
            onSkip={onSkip}
          />
        )}
        {currentStep === 2 && (
          <QuestionnaireStep2
            size={size}
            locationtype={location_type}
            seatCount={seat_count}
            register={register}
            setValue={setValue}
            onNext={goNext}
            onPrev={goPrev}
          />
        )}
        {currentStep === 3 && (
          <QuestionnaireStep3
            selectedConcerns={primary_concerns}
            setValue={setValue}
            onNext={goNext}
            onPrev={goPrev}
          />
        )}
        {currentStep === 4 && (
          <QuestionnaireStep4
            selectedTemplate={template}
            restaurantType={restaurant_type}
            setValue={setValue}
            onPrev={goPrev}
          />
        )}
      </AnimatePresence>
    </form>
  );
}
