import { motion } from 'framer-motion';
import type { RestaurantType, ProfileQuestionnaireData } from '../../types/profile.types';
import { RESTAURANT_TYPE_LABELS } from '../../types/profile.types';
import ThiingsIcon from '../common/ThiingsIcon';
import type { UseFormSetValue } from 'react-hook-form';

interface Step1Props {
  restaurantType: RestaurantType | undefined;
  setValue: UseFormSetValue<ProfileQuestionnaireData>;
  onNext: () => void;
  onSkip?: () => void;
}

export default function QuestionnaireStep1({ restaurantType, setValue, onNext, onSkip }: Step1Props) {
  return (
    <motion.div
      key="step1"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div>
        <h2 className="text-2xl font-bold text-deep-charcoal mb-2">What type of restaurant do you run?</h2>
        <p className="text-stone-gray text-sm">This helps us customize your dashboard experience</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(Object.keys(RESTAURANT_TYPE_LABELS) as RestaurantType[]).map((type) => {
          const label = RESTAURANT_TYPE_LABELS[type];
          const isSelected = restaurantType === type;

          return (
            <button
              key={type}
              type="button"
              onClick={() => setValue('restaurant_type', type)}
              className={`bg-white border rounded-2xl shadow-sm p-6 text-left transition-all duration-200 cursor-pointer ${
                isSelected ? 'ring-2 ring-burgundy bg-burgundy/5 border-burgundy/30' : 'border-border-gray hover:bg-soft-gray'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-burgundy' : 'bg-soft-gray'}`}>
                  <span className="text-2xl">
                    {type === 'traditional' && '\u{1F3DB}\u{FE0F}'}
                    {type === 'modern' && '\u{2728}'}
                    {type === 'fast-casual' && '\u{26A1}'}
                    {type === 'fine-dining' && '\u{1F377}'}
                  </span>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-deep-charcoal mb-1">{label.name}</h3>
                  <p className="text-sm text-stone-gray">{label.description}</p>
                </div>
                {isSelected && <div className="text-burgundy"><ThiingsIcon name="check-circle" pxSize={24} /></div>}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex justify-between pt-4">
        {onSkip && (
          <button type="button" onClick={onSkip} className="text-muted-stone hover:text-deep-charcoal transition-colors">
            Skip for now
          </button>
        )}
        <button
          type="button"
          onClick={onNext}
          disabled={!restaurantType}
          className="bg-burgundy hover:bg-burgundy-dark px-8 py-3 text-white font-bold rounded-xl flex items-center gap-2 ml-auto disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Continue <ThiingsIcon name="chevron-right" pxSize={20} />
        </button>
      </div>
    </motion.div>
  );
}
