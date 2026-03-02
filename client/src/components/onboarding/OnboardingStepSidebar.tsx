import ThiingsIcon from '../common/ThiingsIcon';
import { useTranslation } from 'react-i18next';

const STEP_NAME_KEYS = ['onboarding.stepName1', 'onboarding.stepName2', 'onboarding.stepName3', 'onboarding.stepName4', 'onboarding.stepName5'];

interface OnboardingStepSidebarProps {
  currentStep: number;
  goToStep: (step: number) => void;
}

export default function OnboardingStepSidebar({ currentStep, goToStep }: OnboardingStepSidebarProps) {
  const { t } = useTranslation();

  return (
    <div className="hidden md:block flex-shrink-0 w-[220px] pt-2">
      <div className="flex flex-col">
        {STEP_NAME_KEYS.map((key, index) => {
          const name = t(key);
          const stepNumber = index + 1;
          const isActive = stepNumber === currentStep;
          const isCompleted = stepNumber < currentStep;
          const isLast = index === STEP_NAME_KEYS.length - 1;

          return (
            <div key={stepNumber} className="flex items-start py-4 relative">
              {!isLast && (
                <div
                  className={`absolute left-[15px] top-[48px] bottom-0 w-px ${
                    isCompleted
                      ? 'bg-burgundy'
                      : isActive
                        ? 'bg-gradient-to-b from-burgundy to-border-gray'
                        : 'bg-border-gray'
                  }`}
                />
              )}
              <button
                type="button"
                onClick={() => { if (isCompleted) goToStep(stepNumber); }}
                disabled={!isCompleted}
                aria-label={isCompleted ? `Go back to step ${stepNumber}` : undefined}
                className={`flex items-center gap-4 w-full text-left ${isCompleted ? 'cursor-pointer hover:opacity-75 transition-opacity' : 'cursor-default'}`}
              >
                <div
                  className={`relative z-10 w-8 h-8 rounded-full border-2 flex items-center justify-center text-[13px] font-semibold flex-shrink-0 ${
                    isCompleted
                      ? 'border-burgundy bg-burgundy text-white'
                      : isActive
                        ? 'border-burgundy bg-burgundy/[0.06] text-burgundy'
                        : 'border-border-gray bg-white text-muted-stone'
                  }`}
                >
                  {isCompleted ? (
                    <ThiingsIcon name="check" pxSize={14} />
                  ) : (
                    stepNumber
                  )}
                </div>
                <span
                  className={`text-sm pt-[5px] ${
                    isActive
                      ? 'font-semibold text-deep-charcoal'
                      : isCompleted
                        ? 'font-medium text-stone-gray'
                        : 'font-medium text-muted-stone'
                  }`}
                >
                  {name}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
