/**
 * Step 1.5: AI Restaurant Learning
 *
 * Three-phase step in the onboarding wizard:
 * 1. Research - AI researches the restaurant online (auto-starts)
 * 2. Interview - Chat interview to fill in knowledge gaps
 * 3. Persona - Preview and approve the AI persona
 *
 * Uses data from Step 1 (restaurant_name, city, country, website)
 * to kick off the research phase automatically.
 */

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import type { OnboardingData } from '../../types/onboarding.types';
import { useRestaurantLearning } from '../../hooks/useRestaurantLearning';
import ResearchLoadingState from './restaurant-learning/ResearchLoadingState';
import LearningChat from './restaurant-learning/LearningChat';
import PersonaPreviewComponent from './restaurant-learning/PersonaPreview';

interface Step1_5Props {
  data: OnboardingData;
  updateData: (updates: Partial<OnboardingData>) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function Step1_5RestaurantLearning({ data, updateData, onNext, onBack }: Step1_5Props) {
  const {
    phase,
    isLoading,
    error,
    researchResult,
    messages,
    persona,
    topicsCovered,
    sessionId,
    shouldGeneratePersona,
    startResearch,
    sendMessage,
    generatePersona,
    setPhase,
    restart,
  } = useRestaurantLearning();

  const hasStartedRef = useRef(false);

  // Auto-trigger persona generation after sendMessage signals readiness
  useEffect(() => {
    if (shouldGeneratePersona) {
      generatePersona();
    }
  }, [shouldGeneratePersona, generatePersona]);

  // Abort any in-flight requests when navigating away from this step
  useEffect(() => {
    return () => {
      restart();
    };
  }, []);

  // Auto-start research when the step mounts
  useEffect(() => {
    if (hasStartedRef.current) return;
    if (data.restaurant_learning?.skipped) return;

    hasStartedRef.current = true;
    startResearch(
      data.restaurant_name,
      data.city,
      data.country,
      data.website || undefined
    );
  }, []);

  const handleSkip = () => {
    updateData({
      restaurant_learning: {
        ...data.restaurant_learning,
        skipped: true,
      },
    });
    onNext();
  };

  const handleApprovePersona = () => {
    updateData({
      restaurant_learning: {
        session_id: sessionId || undefined,
        restaurant_profile: researchResult || undefined,
        skipped: false,
      },
    });
    onNext();
  };

  const handleEditPersona = () => {
    // Go back to interview to refine
    setPhase('interview');
  };

  const handleRestart = () => {
    restart();
    hasStartedRef.current = false;
    // Re-trigger research
    setTimeout(() => {
      hasStartedRef.current = true;
      startResearch(
        data.restaurant_name,
        data.city,
        data.country,
        data.website || undefined
      );
    }, 100);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="inline-flex items-center justify-center w-10 h-10 bg-[#9F1239]/10 rounded-full">
            <svg className="w-5 h-5 text-[#9F1239]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
            </svg>
          </div>
          <h2 className="font-serif text-2xl font-bold text-[#1C1917]">
            Let's teach your AI about {data.restaurant_name}
          </h2>
        </div>
        <p className="text-sm text-[#57534E]">
          We'll research your restaurant online, then ask a few questions to build a personalized AI persona.
        </p>
      </div>

      {/* Error Banner */}
      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3"
        >
          <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-700">Something went wrong</p>
            <p className="text-sm text-red-600 mt-0.5">
              {error.toLowerCase().includes('fetch') || error.toLowerCase().includes('network')
                ? 'Check your internet connection and try again.'
                : 'We were unable to complete this step. You can try again or skip for now.'}
            </p>
            <div className="flex items-center gap-4 mt-3">
              <button
                type="button"
                onClick={handleRestart}
                className="text-sm font-semibold text-red-700 underline underline-offset-2 hover:no-underline"
              >
                Try Again
              </button>
              <button
                type="button"
                onClick={handleSkip}
                className="text-sm text-red-500 hover:text-red-700 transition-colors"
              >
                Skip for now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Phase 1: Research Loading */}
      {phase === 'research' && (
        isLoading
          ? <ResearchLoadingState restaurantName={data.restaurant_name} onSkip={handleSkip} />
          : !error && (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
              <p className="text-sm text-[#57534E]">Research ready to start.</p>
              <button
                type="button"
                onClick={() => startResearch(data.restaurant_name, data.city, data.country, data.website || undefined)}
                className="px-6 py-3 bg-[#9F1239] hover:bg-[#881337] text-white font-bold rounded-xl transition-colors"
              >
                Start Research
              </button>
            </div>
          )
      )}

      {/* Phase 2: Interview Chat */}
      {phase === 'interview' && (
        <LearningChat
          messages={messages}
          topicsCovered={topicsCovered}
          isLoading={isLoading}
          onSendMessage={sendMessage}
          onGeneratePersona={generatePersona}
        />
      )}

      {/* Phase 3: Persona Preview (or generation loading) */}
      {phase === 'persona' && (
        persona ? (
          <PersonaPreviewComponent
            persona={persona}
            onApprove={handleApprovePersona}
            onEdit={handleEditPersona}
            onRestart={handleRestart}
            isLoading={isLoading}
          />
        ) : isLoading && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="w-12 h-12 rounded-full bg-[#9F1239]/10 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-[#9F1239]/30 border-t-[#9F1239] rounded-full animate-spin" />
            </div>
            <p className="text-sm text-[#57534E] font-medium">Building your AI persona...</p>
            <p className="text-xs text-[#A8A29E]">This usually takes a few seconds</p>
          </div>
        )
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4 border-t border-[#E7E5E4]">
        <button
          type="button"
          onClick={onBack}
          disabled={isLoading && phase === 'research'}
          aria-label={isLoading && phase === 'research' ? 'Back (unavailable while researching)' : 'Go back to previous step'}
          className="px-6 py-3 bg-white hover:bg-[#F5F5F4] border border-[#E7E5E4] text-[#1C1917] font-semibold rounded-xl transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <button
          type="button"
          onClick={handleSkip}
          className="text-sm text-[#57534E] hover:text-[#9F1239] font-medium transition-colors underline underline-offset-2"
        >
          Skip for now
        </button>
      </div>
    </motion.div>
  );
}
