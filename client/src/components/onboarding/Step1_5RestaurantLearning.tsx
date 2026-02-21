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
import { motion, AnimatePresence } from 'framer-motion';
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

/** Phase labels for the step indicator */
const PHASE_LABELS: Record<string, string> = {
  research: 'Research',
  interview: 'Interview',
  persona: 'Persona',
};

const PHASES = ['research', 'interview', 'persona'] as const;
type Phase = typeof PHASES[number];

export default function Step1_5RestaurantLearning({ data, updateData, onNext, onBack }: Step1_5Props) {
  const {
    phase,
    isLoading,
    error,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        restaurant_profile: persona?.restaurant_profile || undefined,
        skipped: false,
      },
    });
    onNext();
  };

  const handleEditPersona = () => {
    setPhase('interview');
  };

  const handleRestart = () => {
    restart();
    hasStartedRef.current = false;
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

  const currentPhaseIndex = PHASES.indexOf(phase as Phase);

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
          <div
            className="inline-flex items-center justify-center w-10 h-10 bg-[#9F1239]/10 rounded-full flex-shrink-0"
            aria-hidden="true"
          >
            <svg className="w-5 h-5 text-[#9F1239]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
            </svg>
          </div>
          <h2 className="font-serif text-2xl font-bold text-[#1C1917]">
            Let&apos;s teach your AI about {data.restaurant_name}
          </h2>
        </div>
        <p className="text-sm text-[#57534E] leading-relaxed">
          We&apos;ll research your restaurant online, then ask a few questions to build a personalized AI persona.
        </p>
      </div>

      {/* Phase indicator */}
      <nav aria-label="Setup progress" className="flex items-center gap-0">
        {PHASES.map((p, i) => {
          const isComplete = currentPhaseIndex > i;
          const isActive = currentPhaseIndex === i;
          return (
            <div key={p} className="flex items-center flex-1 last:flex-initial">
              <div className="flex items-center gap-1.5">
                <div
                  aria-current={isActive ? 'step' : undefined}
                  aria-label={`Step ${i + 1}: ${PHASE_LABELS[p]}${isComplete ? ' (completed)' : isActive ? ' (current)' : ''}`}
                  className={`
                    flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold transition-colors duration-300
                    ${isComplete ? 'bg-[#9F1239] text-white' : isActive ? 'bg-[#9F1239]/15 text-[#9F1239] ring-2 ring-[#9F1239]/50' : 'bg-[#E7E5E4] text-[#A8A29E]'}
                  `}
                >
                  {isComplete ? (
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>
                <span
                  className={`text-xs font-medium hidden sm:inline ${isActive ? 'text-[#9F1239]' : isComplete ? 'text-[#57534E]' : 'text-[#A8A29E]'}`}
                  aria-hidden="true"
                >
                  {PHASE_LABELS[p]}
                </span>
              </div>
              {i < PHASES.length - 1 && (
                <div
                  aria-hidden="true"
                  className={`flex-1 h-px mx-2 transition-colors duration-300 ${isComplete ? 'bg-[#9F1239]/40' : 'bg-[#E7E5E4]'}`}
                />
              )}
            </div>
          );
        })}
      </nav>

      {/* Error Banner */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            role="alert"
            aria-live="assertive"
            className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 overflow-hidden"
          >
            <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1 min-w-0">
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
                  className="text-sm font-semibold text-red-700 underline underline-offset-2 hover:no-underline focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 rounded"
                >
                  Try Again
                </button>
                <button
                  type="button"
                  onClick={handleSkip}
                  className="text-sm text-red-500 hover:text-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 rounded"
                >
                  Skip for now
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Phase 1: Research Loading */}
      {phase === 'research' && (
        isLoading
          ? <ResearchLoadingState restaurantName={data.restaurant_name} onSkip={handleSkip} />
          : !error && (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
              <p className="text-sm text-[#57534E]">Ready to start researching your restaurant.</p>
              <button
                type="button"
                onClick={() => startResearch(data.restaurant_name, data.city, data.country, data.website || undefined)}
                className="px-6 py-3 bg-[#9F1239] hover:bg-[#881337] text-white font-bold rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-[#9F1239] focus:ring-offset-2"
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
        ) : isLoading ? (
          <div
            role="status"
            aria-live="polite"
            aria-label="Building your AI persona, please wait"
            className="flex flex-col items-center justify-center py-14 space-y-4"
          >
            {/* Layered spinner rings for visual depth */}
            <div className="relative w-14 h-14">
              <div className="absolute inset-0 rounded-full border-4 border-[#9F1239]/10" />
              <motion.div
                className="absolute inset-0 rounded-full border-4 border-transparent border-t-[#9F1239]"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <svg className="w-5 h-5 text-[#9F1239]/50" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
              </div>
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold text-[#1C1917]">Building your AI persona</p>
              <p className="text-xs text-[#A8A29E]">This usually takes a few seconds</p>
            </div>
          </div>
        ) : null
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4 border-t border-[#E7E5E4]">
        <button
          type="button"
          onClick={onBack}
          disabled={isLoading && phase === 'research'}
          aria-label={isLoading && phase === 'research' ? 'Back unavailable while researching' : 'Go back to previous step'}
          className="px-5 py-2.5 bg-white hover:bg-[#F5F5F4] border border-[#E7E5E4] text-[#1C1917] font-semibold rounded-xl transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#9F1239] focus:ring-offset-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <button
          type="button"
          onClick={handleSkip}
          className="text-sm text-[#57534E] hover:text-[#9F1239] font-medium transition-colors underline underline-offset-2 focus:outline-none focus:ring-2 focus:ring-[#9F1239] focus:ring-offset-2 rounded"
        >
          Skip for now
        </button>
      </div>
    </motion.div>
  );
}
