import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import WhatsAppPhoneAnimation from './WhatsAppPhoneAnimation';
import DashboardSyncAnimation from './DashboardSyncAnimation';

/**
 * HeroSplitScreen — orchestrates the WhatsApp phone + Dashboard sync animation.
 * Manages a shared step counter that both children consume.
 *
 * Steps: 0→msg1, 1→msg2, 2→msg3, 3→msg4(confirmed), 4→pause, then restart.
 */
export default function HeroSplitScreen() {
  const [currentStep, setCurrentStep] = useState(-1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const handleMessageStep = useCallback((step: number) => {
    setCurrentStep(step);
  }, []);

  // Reset loop: after step 3 (last message), wait 5s then restart
  useEffect(() => {
    if (currentStep >= 3) {
      timerRef.current = setTimeout(() => {
        setCurrentStep(-1);
        // Small delay before restarting
        setTimeout(() => setCurrentStep(-1), 100);
      }, 5000);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [currentStep]);

  if (prefersReducedMotion) {
    // Show final state statically
    return (
      <div className="flex flex-col lg:flex-row items-center justify-center gap-8 lg:gap-12 w-full max-w-[900px] mx-auto">
        <WhatsAppPhoneAnimation onMessageStep={() => {}} className="flex-shrink-0" />
        <div className="hidden lg:block flex-shrink-0">
          <DashboardSyncAnimation currentStep={3} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row items-center justify-center gap-8 lg:gap-12 w-full max-w-[900px] mx-auto">
      <motion.div
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.8, delay: 0.2 }}
        className="flex-shrink-0"
      >
        <WhatsAppPhoneAnimation
          onMessageStep={handleMessageStep}
          className=""
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: 30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.8, delay: 0.4 }}
        className="hidden lg:block flex-shrink-0"
      >
        <DashboardSyncAnimation currentStep={currentStep} />
      </motion.div>
    </div>
  );
}
