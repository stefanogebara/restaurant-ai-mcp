/**
 * Restaurant Profile Questionnaire
 *
 * Multi-step questionnaire to determine optimal dashboard configuration
 * based on restaurant characteristics and owner preferences.
 *
 * Steps:
 * 1. Restaurant Type
 * 2. Size & Location
 * 3. Primary Concerns
 * 4. Dashboard Complexity
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useForm } from 'react-hook-form';
import type {
  ProfileQuestionnaireData,
  RestaurantType,
  RestaurantSize,
  LocationType,
  PrimaryConcern,
  ProfileTemplate,
} from '../../types/profile.types';
import {
  RESTAURANT_TYPE_LABELS,
  SIZE_LABELS,
  LOCATION_TYPE_LABELS,
  PRIMARY_CONCERN_LABELS,
  TEMPLATE_CONFIGS,
} from '../../types/profile.types';
import '../../landing/styles/glass-morphism.css';

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
  });

  const watchedValues = watch();
  const totalSteps = 4;

  // ===========================
  // Navigation Handlers
  // ===========================

  const goToNextStep = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    }
  };

  const goToPreviousStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleFormSubmit = (data: ProfileQuestionnaireData) => {
    onComplete(data);
  };

  // ===========================
  // Step 1: Restaurant Type
  // ===========================

  const renderStep1 = () => (
    <motion.div
      key="step1"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">What type of restaurant do you run?</h2>
        <p className="text-gray-300 text-sm">This helps us customize your dashboard experience</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(Object.keys(RESTAURANT_TYPE_LABELS) as RestaurantType[]).map((type) => {
          const label = RESTAURANT_TYPE_LABELS[type];
          const isSelected = watchedValues.restaurant_type === type;

          return (
            <button
              key={type}
              type="button"
              onClick={() => setValue('restaurant_type', type)}
              className={`
                glass-card p-6 text-left transition-all duration-200 cursor-pointer
                ${isSelected ? 'ring-2 ring-indigo-500 bg-indigo-500/10' : 'hover:bg-white/5'}
              `}
            >
              <div className="flex items-start gap-4">
                <div className={`
                  w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0
                  ${isSelected ? 'bg-indigo-500' : 'bg-white/10'}
                `}>
                  <span className="text-2xl">
                    {type === 'traditional' && '🏛️'}
                    {type === 'modern' && '✨'}
                    {type === 'fast-casual' && '⚡'}
                    {type === 'fine-dining' && '🍷'}
                  </span>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white mb-1">{label.name}</h3>
                  <p className="text-sm text-gray-300">{label.description}</p>
                </div>
                {isSelected && (
                  <div className="text-indigo-400">
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex justify-between pt-4">
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="text-gray-400 hover:text-white transition-colors"
          >
            Skip for now
          </button>
        )}
        <button
          type="button"
          onClick={goToNextStep}
          disabled={!watchedValues.restaurant_type}
          className="glass-button-primary px-8 py-3 text-white font-bold rounded-lg flex items-center gap-2 ml-auto disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </motion.div>
  );

  // ===========================
  // Step 2: Size & Location
  // ===========================

  const renderStep2 = () => (
    <motion.div
      key="step2"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Tell us about your restaurant</h2>
        <p className="text-gray-300 text-sm">Size and location help us recommend the right features</p>
      </div>

      {/* Restaurant Size */}
      <div>
        <label className="block text-sm font-semibold text-white mb-3">Restaurant Size</label>
        <div className="grid grid-cols-3 gap-4">
          {(Object.keys(SIZE_LABELS) as RestaurantSize[]).map((size) => {
            const label = SIZE_LABELS[size];
            const isSelected = watchedValues.size === size;

            return (
              <button
                key={size}
                type="button"
                onClick={() => setValue('size', size)}
                className={`
                  glass-card p-4 text-center transition-all duration-200 cursor-pointer
                  ${isSelected ? 'ring-2 ring-indigo-500 bg-indigo-500/10' : 'hover:bg-white/5'}
                `}
              >
                <div className={`text-3xl mb-2 ${isSelected ? 'scale-110' : ''} transition-transform`}>
                  {size === 'small' && '🪑'}
                  {size === 'medium' && '🏠'}
                  {size === 'large' && '🏢'}
                </div>
                <div className="font-semibold text-white">{label.name}</div>
                <div className="text-xs text-gray-400 mt-1">{label.range}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Optional: Exact Seat Count */}
      <div>
        <label htmlFor="seat_count" className="block text-sm font-semibold text-white mb-2">
          Number of Seats (Optional)
        </label>
        <input
          id="seat_count"
          type="number"
          {...register('seat_count')}
          placeholder="e.g., 45"
          className="glass-input w-full px-4 py-3 text-white placeholder-gray-400"
          min="1"
          max="500"
        />
      </div>

      {/* Location Type */}
      <div>
        <label className="block text-sm font-semibold text-white mb-3">Location Type</label>
        <div className="grid grid-cols-2 gap-4">
          {(Object.keys(LOCATION_TYPE_LABELS) as LocationType[]).map((locationType) => {
            const label = LOCATION_TYPE_LABELS[locationType];
            const isSelected = watchedValues.location_type === locationType;

            return (
              <button
                key={locationType}
                type="button"
                onClick={() => setValue('location_type', locationType)}
                className={`
                  glass-card p-4 text-left transition-all duration-200 cursor-pointer
                  ${isSelected ? 'ring-2 ring-indigo-500 bg-indigo-500/10' : 'hover:bg-white/5'}
                `}
              >
                <div className="flex items-center gap-3">
                  <div className="text-2xl">
                    {locationType === 'tourist' && '🗼'}
                    {locationType === 'residential' && '🏘️'}
                    {locationType === 'business' && '🏙️'}
                    {locationType === 'town_center' && '🏛️'}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-white text-sm">{label.name}</div>
                    <div className="text-xs text-gray-400 mt-1">{label.description}</div>
                  </div>
                  {isSelected && (
                    <div className="text-indigo-400">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex justify-between pt-4">
        <button
          type="button"
          onClick={goToPreviousStep}
          className="glass-button-secondary px-6 py-3 text-white font-semibold rounded-lg flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <button
          type="button"
          onClick={goToNextStep}
          disabled={!watchedValues.size || !watchedValues.location_type}
          className="glass-button-primary px-8 py-3 text-white font-bold rounded-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </motion.div>
  );

  // ===========================
  // Step 3: Primary Concerns
  // ===========================

  const renderStep3 = () => {
    const selectedConcerns = watchedValues.primary_concerns || [];

    const toggleConcern = (concern: PrimaryConcern) => {
      const current = selectedConcerns;
      if (current.includes(concern)) {
        setValue('primary_concerns', current.filter((c) => c !== concern));
      } else {
        if (current.length < 5) {
          setValue('primary_concerns', [...current, concern]);
        }
      }
    };

    return (
      <motion.div
        key="step3"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        className="space-y-6"
      >
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">What are your main priorities?</h2>
          <p className="text-gray-300 text-sm">
            Select 3-5 concerns that matter most to you (click to select)
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(Object.keys(PRIMARY_CONCERN_LABELS) as PrimaryConcern[]).map((concern) => {
            const label = PRIMARY_CONCERN_LABELS[concern];
            const isSelected = selectedConcerns.includes(concern);
            const isDisabled = !isSelected && selectedConcerns.length >= 5;

            return (
              <button
                key={concern}
                type="button"
                onClick={() => toggleConcern(concern)}
                disabled={isDisabled}
                className={`
                  glass-card p-5 text-left transition-all duration-200 cursor-pointer
                  ${isSelected ? 'ring-2 ring-indigo-500 bg-indigo-500/10' : 'hover:bg-white/5'}
                  ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
                `}
              >
                <div className="flex items-start gap-3">
                  <div className={`
                    w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0
                    ${isSelected ? 'bg-indigo-500' : 'bg-white/10'}
                  `}>
                    <span className="text-xl">
                      {concern === 'no_shows' && '🚫'}
                      {concern === 'peak_hours' && '⏰'}
                      {concern === 'regular_customers' && '❤️'}
                      {concern === 'table_turnover' && '🔄'}
                      {concern === 'revenue' && '💰'}
                      {concern === 'waitlist' && '📋'}
                    </span>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-white mb-1">{label.name}</h3>
                    <p className="text-xs text-gray-400">{label.description}</p>
                  </div>
                  {isSelected && (
                    <div className="text-indigo-400">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="text-sm text-gray-400 text-center">
          {selectedConcerns.length} of 3-5 selected
        </div>

        <div className="flex justify-between pt-4">
          <button
            type="button"
            onClick={goToPreviousStep}
            className="glass-button-secondary px-6 py-3 text-white font-semibold rounded-lg flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <button
            type="button"
            onClick={goToNextStep}
            disabled={selectedConcerns.length < 3}
            className="glass-button-primary px-8 py-3 text-white font-bold rounded-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </motion.div>
    );
  };

  // ===========================
  // Step 4: Dashboard Complexity
  // ===========================

  const renderStep4 = () => (
    <motion.div
      key="step4"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Choose your dashboard style</h2>
        <p className="text-gray-300 text-sm">
          Pick the level of detail that works best for you
        </p>
      </div>

      <div className="space-y-4">
        {(Object.keys(TEMPLATE_CONFIGS) as ProfileTemplate[]).map((template) => {
          const config = TEMPLATE_CONFIGS[template];
          const isSelected = watchedValues.template === template;
          const isRecommended =
            (watchedValues.restaurant_type === 'traditional' && template === 'simple') ||
            (watchedValues.restaurant_type === 'modern' && template === 'balanced') ||
            (watchedValues.restaurant_type === 'fast-casual' && template === 'advanced');

          return (
            <button
              key={template}
              type="button"
              onClick={() => setValue('template', template)}
              className={`
                glass-card p-6 text-left transition-all duration-200 cursor-pointer w-full
                ${isSelected ? 'ring-2 ring-indigo-500 bg-indigo-500/10' : 'hover:bg-white/5'}
              `}
            >
              <div className="flex items-start gap-4">
                <div className={`
                  w-16 h-16 rounded-lg flex items-center justify-center flex-shrink-0
                  ${isSelected ? 'bg-indigo-500' : 'bg-white/10'}
                `}>
                  <span className="text-3xl">
                    {template === 'simple' && '📊'}
                    {template === 'balanced' && '⚖️'}
                    {template === 'advanced' && '🚀'}
                  </span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-xl font-semibold text-white">{config.name}</h3>
                    {isRecommended && (
                      <span className="px-2 py-1 text-xs font-semibold bg-green-500/20 text-green-400 rounded-full">
                        Recommended
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-300 mb-3">{config.description}</p>
                  <div className="text-xs text-gray-400">
                    <strong>Best for:</strong> {config.recommended_for.join(', ')}
                  </div>
                  <div className="mt-3 text-xs text-gray-400">
                    <strong>Shows:</strong> {config.visible_metrics.length} metrics
                  </div>
                </div>
                {isSelected && (
                  <div className="text-indigo-400">
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <div className="text-indigo-400 flex-shrink-0">
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <p className="text-sm text-gray-300">
            Don't worry! You can always customize your dashboard later in Settings.
          </p>
        </div>
      </div>

      <div className="flex justify-between pt-4">
        <button
          type="button"
          onClick={goToPreviousStep}
          className="glass-button-secondary px-6 py-3 text-white font-semibold rounded-lg flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <button
          type="submit"
          disabled={!watchedValues.template}
          className="glass-button-primary px-8 py-3 text-white font-bold rounded-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Complete Profile
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </button>
      </div>
    </motion.div>
  );

  // ===========================
  // Main Render
  // ===========================

  const steps = [renderStep1, renderStep2, renderStep3, renderStep4];

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="w-full">
      {/* Progress Indicator */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-300">
            Profile Setup: Step {currentStep} of {totalSteps}
          </span>
          <span className="text-sm font-semibold text-gray-300">
            {Math.round((currentStep / totalSteps) * 100)}% Complete
          </span>
        </div>
        <div className="h-2 bg-white/5 rounded-full overflow-hidden backdrop-blur-sm border border-white/10">
          <motion.div
            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500"
            initial={{ width: 0 }}
            animate={{ width: `${(currentStep / totalSteps) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Step Content */}
      <AnimatePresence mode="wait">{steps[currentStep - 1]()}</AnimatePresence>
    </form>
  );
}
