import { motion } from 'framer-motion';
import type { ProfileTemplate, RestaurantType, ProfileQuestionnaireData } from '../../types/profile.types';
import { TEMPLATE_CONFIGS } from '../../types/profile.types';
import ThiingsIcon from '../common/ThiingsIcon';
import type { UseFormSetValue } from 'react-hook-form';

interface Step4Props {
  selectedTemplate: ProfileTemplate | undefined;
  restaurantType: RestaurantType | undefined;
  setValue: UseFormSetValue<ProfileQuestionnaireData>;
  onPrev: () => void;
}

export default function QuestionnaireStep4({ selectedTemplate, restaurantType, setValue, onPrev }: Step4Props) {
  return (
    <motion.div
      key="step4"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div>
        <h2 className="text-2xl font-bold text-deep-charcoal mb-2">Choose your dashboard style</h2>
        <p className="text-stone-gray text-sm">Pick the level of detail that works best for you</p>
      </div>

      <div className="space-y-4">
        {(Object.keys(TEMPLATE_CONFIGS) as ProfileTemplate[]).map((template) => {
          const config = TEMPLATE_CONFIGS[template];
          const isSelected = selectedTemplate === template;
          const isRecommended =
            (restaurantType === 'traditional' && template === 'simple') ||
            (restaurantType === 'modern' && template === 'balanced') ||
            (restaurantType === 'fast-casual' && template === 'advanced');

          return (
            <button
              key={template}
              type="button"
              onClick={() => setValue('template', template)}
              className={`bg-white border rounded-2xl shadow-sm p-6 text-left transition-all duration-200 cursor-pointer w-full ${
                isSelected ? 'ring-2 ring-burgundy bg-burgundy/5 border-burgundy/30' : 'border-border-gray hover:bg-soft-gray'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-16 h-16 rounded-lg flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-burgundy' : 'bg-soft-gray'}`}>
                  <span className="text-3xl">
                    {template === 'simple' && '\u{1F4CA}'}
                    {template === 'balanced' && '\u{2696}\u{FE0F}'}
                    {template === 'advanced' && '\u{1F680}'}
                  </span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-xl font-semibold text-deep-charcoal">{config.name}</h3>
                    {isRecommended && (
                      <span className="px-2 py-1 text-xs font-semibold bg-green-500/15 text-green-500 rounded-full">
                        Recommended
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-stone-gray mb-3">{config.description}</p>
                  <div className="text-xs text-muted-stone">
                    <strong>Best for:</strong> {config.recommended_for.join(', ')}
                  </div>
                  <div className="mt-3 text-xs text-muted-stone">
                    <strong>Shows:</strong> {config.visible_metrics.length} metrics
                  </div>
                </div>
                {isSelected && <div className="text-burgundy"><ThiingsIcon name="check-circle" pxSize={24} /></div>}
              </div>
            </button>
          );
        })}
      </div>

      <div className="bg-burgundy/10 border border-burgundy/20 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="text-burgundy flex-shrink-0"><ThiingsIcon name="info" pxSize={24} /></div>
          <p className="text-sm text-stone-gray">
            Don't worry! You can always customize your dashboard later in Settings.
          </p>
        </div>
      </div>

      <div className="flex justify-between pt-4">
        <button
          type="button"
          onClick={onPrev}
          className="px-6 py-3 bg-white hover:bg-soft-gray border border-border-gray text-deep-charcoal font-semibold rounded-xl flex items-center gap-2 transition-colors"
        >
          <ThiingsIcon name="chevron-left" pxSize={20} /> Back
        </button>
        <button
          type="submit"
          disabled={!selectedTemplate}
          className="bg-burgundy hover:bg-burgundy-dark px-8 py-3 text-white font-bold rounded-xl flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Complete Profile <ThiingsIcon name="check" pxSize={20} />
        </button>
      </div>
    </motion.div>
  );
}
