import { motion } from 'framer-motion';
import type { PrimaryConcern, ProfileQuestionnaireData } from '../../types/profile.types';
import { PRIMARY_CONCERN_LABELS } from '../../types/profile.types';
import ThiingsIcon from '../common/ThiingsIcon';
import type { UseFormSetValue } from 'react-hook-form';

interface Step3Props {
  selectedConcerns: PrimaryConcern[];
  setValue: UseFormSetValue<ProfileQuestionnaireData>;
  onNext: () => void;
  onPrev: () => void;
}

export default function QuestionnaireStep3({ selectedConcerns, setValue, onNext, onPrev }: Step3Props) {
  const toggleConcern = (concern: PrimaryConcern) => {
    if (selectedConcerns.includes(concern)) {
      setValue('primary_concerns', selectedConcerns.filter((c) => c !== concern));
    } else if (selectedConcerns.length < 5) {
      setValue('primary_concerns', [...selectedConcerns, concern]);
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
        <h2 className="text-2xl font-bold text-deep-charcoal mb-2">What are your main priorities?</h2>
        <p className="text-stone-gray text-sm">Select 3-5 concerns that matter most to you (click to select)</p>
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
              className={`bg-white border rounded-2xl shadow-sm p-5 text-left transition-all duration-200 cursor-pointer ${
                isSelected ? 'ring-2 ring-burgundy bg-burgundy/5 border-burgundy/30' : 'border-border-gray hover:bg-soft-gray'
              } ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-burgundy' : 'bg-soft-gray'}`}>
                  <span className="text-xl">
                    {concern === 'no_shows' && '\u{1F6AB}'}
                    {concern === 'peak_hours' && '\u{23F0}'}
                    {concern === 'regular_customers' && '\u{2764}\u{FE0F}'}
                    {concern === 'table_turnover' && '\u{1F504}'}
                    {concern === 'revenue' && '\u{1F4B0}'}
                    {concern === 'waitlist' && '\u{1F4CB}'}
                  </span>
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-deep-charcoal mb-1">{label.name}</h3>
                  <p className="text-xs text-muted-stone">{label.description}</p>
                </div>
                {isSelected && <div className="text-burgundy"><ThiingsIcon name="check-circle" pxSize={20} /></div>}
              </div>
            </button>
          );
        })}
      </div>

      <div className="text-sm text-muted-stone text-center">{selectedConcerns.length} of 3-5 selected</div>

      <div className="flex justify-between pt-4">
        <button
          type="button"
          onClick={onPrev}
          className="px-6 py-3 bg-white hover:bg-soft-gray border border-border-gray text-deep-charcoal font-semibold rounded-xl flex items-center gap-2 transition-colors"
        >
          <ThiingsIcon name="chevron-left" pxSize={20} /> Back
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={selectedConcerns.length < 3}
          className="bg-burgundy hover:bg-burgundy-dark px-8 py-3 text-white font-bold rounded-xl flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Continue <ThiingsIcon name="chevron-right" pxSize={20} />
        </button>
      </div>
    </motion.div>
  );
}
