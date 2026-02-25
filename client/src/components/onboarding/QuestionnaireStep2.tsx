import { motion } from 'framer-motion';
import type { RestaurantSize, LocationType, ProfileQuestionnaireData } from '../../types/profile.types';
import { SIZE_LABELS, LOCATION_TYPE_LABELS } from '../../types/profile.types';
import ThiingsIcon from '../common/ThiingsIcon';
import type { UseFormRegister, UseFormSetValue } from 'react-hook-form';

interface Step2Props {
  size: RestaurantSize | undefined;
  locationtype: LocationType | undefined;
  seatCount: number | undefined;
  register: UseFormRegister<ProfileQuestionnaireData>;
  setValue: UseFormSetValue<ProfileQuestionnaireData>;
  onNext: () => void;
  onPrev: () => void;
}

export default function QuestionnaireStep2({
  size, locationtype, seatCount, register, setValue, onNext, onPrev,
}: Step2Props) {
  return (
    <motion.div
      key="step2"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div>
        <h2 className="text-2xl font-bold text-deep-charcoal mb-2">Tell us about your restaurant</h2>
        <p className="text-stone-gray text-sm">Size and location help us recommend the right features</p>
      </div>

      {/* Restaurant Size */}
      <div>
        <label className="block text-sm font-semibold text-deep-charcoal mb-3">Restaurant Size</label>
        <div className="grid grid-cols-3 gap-4">
          {(Object.keys(SIZE_LABELS) as RestaurantSize[]).map((s) => {
            const label = SIZE_LABELS[s];
            const isSelected = size === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setValue('size', s)}
                className={`bg-white border rounded-2xl shadow-sm p-4 text-center transition-all duration-200 cursor-pointer ${
                  isSelected ? 'ring-2 ring-burgundy bg-burgundy/5 border-burgundy/30' : 'border-border-gray hover:bg-soft-gray'
                }`}
              >
                <div className={`text-3xl mb-2 ${isSelected ? 'scale-110' : ''} transition-transform`}>
                  {s === 'small' && '\u{1FA91}'}
                  {s === 'medium' && '\u{1F3E0}'}
                  {s === 'large' && '\u{1F3E2}'}
                </div>
                <div className="font-semibold text-deep-charcoal">{label.name}</div>
                <div className="text-xs text-muted-stone mt-1">{label.range}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Seat Count */}
      <div>
        <label htmlFor="seat_count" className="block text-sm font-semibold text-deep-charcoal mb-2">
          Total Number of Seats <span className="text-burgundy">*</span>
        </label>
        <input
          id="seat_count"
          type="number"
          {...register('seat_count', { required: 'Number of seats is required', min: 1, max: 500 })}
          placeholder="e.g., 45"
          className="w-full px-4 py-3 bg-soft-gray border border-border-gray rounded-xl text-deep-charcoal placeholder-muted-stone focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy transition-all"
          min="1"
          max="500"
        />
        <p className="text-xs text-muted-stone mt-1">This will help pre-configure your table layout</p>
      </div>

      {/* Location Type */}
      <div>
        <label className="block text-sm font-semibold text-deep-charcoal mb-3">Location Type</label>
        <div className="grid grid-cols-2 gap-4">
          {(Object.keys(LOCATION_TYPE_LABELS) as LocationType[]).map((locationType) => {
            const label = LOCATION_TYPE_LABELS[locationType];
            const isSelected = locationtype === locationType;
            return (
              <button
                key={locationType}
                type="button"
                onClick={() => setValue('location_type', locationType)}
                className={`bg-white border rounded-2xl shadow-sm p-4 text-left transition-all duration-200 cursor-pointer ${
                  isSelected ? 'ring-2 ring-burgundy bg-burgundy/5 border-burgundy/30' : 'border-border-gray hover:bg-soft-gray'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="text-2xl">
                    {locationType === 'tourist' && '\u{1F5FC}'}
                    {locationType === 'residential' && '\u{1F3D8}\u{FE0F}'}
                    {locationType === 'business' && '\u{1F3D9}\u{FE0F}'}
                    {locationType === 'town_center' && '\u{1F3DB}\u{FE0F}'}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-deep-charcoal text-sm">{label.name}</div>
                    <div className="text-xs text-muted-stone mt-1">{label.description}</div>
                  </div>
                  {isSelected && <div className="text-burgundy"><ThiingsIcon name="check-circle" pxSize={20} /></div>}
                </div>
              </button>
            );
          })}
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
          type="button"
          onClick={onNext}
          disabled={!size || !locationtype || !seatCount}
          className="bg-burgundy hover:bg-burgundy-dark px-8 py-3 text-white font-bold rounded-xl flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Continue <ThiingsIcon name="chevron-right" pxSize={20} />
        </button>
      </div>
    </motion.div>
  );
}
