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
import ThiingsIcon from '../common/ThiingsIcon';
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
            className="inline-flex items-center justify-center w-10 h-10 bg-burgundy/10 rounded-full flex-shrink-0"
            aria-hidden="true"
          >
            <ThiingsIcon name="sparkles" pxSize={20} className="text-burgundy" />
          </div>
          <h2 className="font-serif text-2xl font-bold text-deep-charcoal">
            Let&apos;s teach your AI about {data.restaurant_name}
          </h2>
        </div>
        <p className="text-sm text-stone-gray leading-relaxed">
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
                    ${isComplete ? 'bg-burgundy text-white' : isActive ? 'bg-burgundy/15 text-burgundy ring-2 ring-burgundy/50' : 'bg-border-gray text-muted-stone'}
                  `}
                >
                  {isComplete ? (
                    <ThiingsIcon name="check" pxSize={12} aria-hidden={true} />
                  ) : (
                    i + 1
                  )}
                </div>
                <span
                  className={`text-xs font-medium hidden sm:inline ${isActive ? 'text-burgundy' : isComplete ? 'text-stone-gray' : 'text-muted-stone'}`}
                  aria-hidden="true"
                >
                  {PHASE_LABELS[p]}
                </span>
              </div>
              {i < PHASES.length - 1 && (
                <div
                  aria-hidden="true"
                  className={`flex-1 h-px mx-2 transition-colors duration-300 ${isComplete ? 'bg-burgundy/40' : 'bg-border-gray'}`}
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
            <ThiingsIcon name="alert-triangle" pxSize={20} className="text-red-500 flex-shrink-0 mt-0.5" />
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
              <p className="text-sm text-stone-gray">Ready to start researching your restaurant.</p>
              <button
                type="button"
                onClick={() => startResearch(data.restaurant_name, data.city, data.country, data.website || undefined)}
                className="px-6 py-3 bg-burgundy hover:bg-burgundy-dark text-white font-bold rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-burgundy focus:ring-offset-2"
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
              <div className="absolute inset-0 rounded-full border-4 border-burgundy/10" />
              <motion.div
                className="absolute inset-0 rounded-full border-4 border-transparent border-t-burgundy"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <ThiingsIcon name="sparkles" pxSize={20} className="text-burgundy/50" />
              </div>
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold text-deep-charcoal">Building your AI persona</p>
              <p className="text-xs text-muted-stone">This usually takes a few seconds</p>
            </div>
          </div>
        ) : null
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4 border-t border-border-gray">
        <button
          type="button"
          onClick={onBack}
          disabled={isLoading && phase === 'research'}
          aria-label={isLoading && phase === 'research' ? 'Back unavailable while researching' : 'Go back to previous step'}
          className="px-5 py-2.5 bg-white hover:bg-soft-gray border border-border-gray text-deep-charcoal font-semibold rounded-xl transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-burgundy focus:ring-offset-2"
        >
          <ThiingsIcon name="chevron-left" pxSize={16} />
          Back
        </button>
        <button
          type="button"
          onClick={handleSkip}
          className="text-sm text-stone-gray hover:text-burgundy font-medium transition-colors underline underline-offset-2 focus:outline-none focus:ring-2 focus:ring-burgundy focus:ring-offset-2 rounded"
        >
          Skip for now
        </button>
      </div>
    </motion.div>
  );
}
