import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import ChipSelector from './ChipSelector';
import type { ProfileUpdatePayload } from '../../hooks/useCustomers';

interface CustomerProfileSectionsProps {
  customerId: string;
  allergies: string[];
  dietaryRestrictions: string[];
  seatingPreferences: string[];
  specialOccasions: Record<string, string>;
  onUpdateProfile: (payload: ProfileUpdatePayload) => void;
}

const ALLERGY_PRESETS = [
  'Gluten', 'Lactose', 'Nuts', 'Seafood', 'Soy', 'Eggs', 'Shellfish',
];

const DIETARY_PRESETS = [
  'Vegetarian', 'Vegan', 'Pescatarian', 'Kosher', 'Halal', 'Low-carb', 'Keto',
];

const SEATING_PRESETS = [
  'Window', 'Outdoor', 'Quiet corner', 'Bar', 'Private room', 'Near entrance',
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[11px] font-bold text-stone-500 uppercase tracking-widest mb-2">
        {title}
      </h3>
      {children}
    </div>
  );
}

export default function CustomerProfileSections({
  customerId,
  allergies,
  dietaryRestrictions,
  seatingPreferences,
  specialOccasions,
  onUpdateProfile,
}: CustomerProfileSectionsProps) {
  const { t } = useTranslation();

  const [birthday, setBirthday] = useState(specialOccasions.birthday || '');
  const [anniversary, setAnniversary] = useState(specialOccasions.anniversary || '');

  const handleAllergiesChange = useCallback(
    (items: string[]) => {
      onUpdateProfile({ customerId, allergies: items });
    },
    [customerId, onUpdateProfile]
  );

  const handleDietaryChange = useCallback(
    (items: string[]) => {
      onUpdateProfile({ customerId, dietary_restrictions: items });
    },
    [customerId, onUpdateProfile]
  );

  const handleSeatingChange = useCallback(
    (items: string[]) => {
      onUpdateProfile({ customerId, seating_preferences: items });
    },
    [customerId, onUpdateProfile]
  );

  const handleBirthdayChange = useCallback(
    (value: string) => {
      setBirthday(value);
      const updated = { ...specialOccasions, birthday: value };
      if (!value) {
        const { birthday: _removed, ...rest } = updated;
        onUpdateProfile({ customerId, special_occasions: rest });
      } else {
        onUpdateProfile({ customerId, special_occasions: updated });
      }
    },
    [customerId, specialOccasions, onUpdateProfile]
  );

  const handleAnniversaryChange = useCallback(
    (value: string) => {
      setAnniversary(value);
      const updated = { ...specialOccasions, anniversary: value };
      if (!value) {
        const { anniversary: _removed, ...rest } = updated;
        onUpdateProfile({ customerId, special_occasions: rest });
      } else {
        onUpdateProfile({ customerId, special_occasions: updated });
      }
    },
    [customerId, specialOccasions, onUpdateProfile]
  );

  const formatOccasionDisplay = (dateStr: string): string => {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
  };

  return (
    <>
      {/* Allergies */}
      <Section title={t('crm.allergies', 'Allergies')}>
        <ChipSelector
          items={allergies}
          presets={ALLERGY_PRESETS.map((a) => t(`crm.allergy_${a.toLowerCase()}`, a))}
          onChange={handleAllergiesChange}
          placeholder={t('crm.addAllergyPlaceholder', 'Add allergy...')}
        />
      </Section>

      {/* Dietary Restrictions */}
      <Section title={t('crm.dietaryRestrictions', 'Dietary Restrictions')}>
        <ChipSelector
          items={dietaryRestrictions}
          presets={DIETARY_PRESETS.map((d) => t(`crm.dietary_${d.toLowerCase().replace('-', '_')}`, d))}
          onChange={handleDietaryChange}
          placeholder={t('crm.addDietaryPlaceholder', 'Add restriction...')}
        />
      </Section>

      {/* Seating Preferences */}
      <Section title={t('crm.seatingPreferences', 'Seating Preferences')}>
        <ChipSelector
          items={seatingPreferences}
          presets={SEATING_PRESETS.map((s) => t(`crm.seating_${s.toLowerCase().replace(/ /g, '_')}`, s))}
          onChange={handleSeatingChange}
          placeholder={t('crm.addSeatingPlaceholder', 'Add preference...')}
        />
      </Section>

      {/* Special Occasions */}
      <Section title={t('crm.specialOccasions', 'Special Occasions')}>
        <div className="space-y-3">
          {/* Birthday */}
          <div>
            <label className="flex items-center gap-2 text-sm text-stone-700 mb-1">
              <span>&#127874;</span>
              {t('crm.birthday', 'Birthday')}
              {birthday && (
                <span className="text-xs text-stone-500">
                  {formatOccasionDisplay(birthday)}
                </span>
              )}
            </label>
            <input
              type="date"
              value={birthday}
              onChange={(e) => handleBirthdayChange(e.target.value)}
              className="w-full text-sm border border-stone-200 rounded-lg px-3 py-1.5 text-stone-900 focus:outline-none focus:ring-1 focus:ring-[#9F1239]/30 focus:border-[#9F1239]/30"
            />
          </div>

          {/* Anniversary */}
          <div>
            <label className="flex items-center gap-2 text-sm text-stone-700 mb-1">
              <span>&#128141;</span>
              {t('crm.anniversary', 'Anniversary')}
              {anniversary && (
                <span className="text-xs text-stone-500">
                  {formatOccasionDisplay(anniversary)}
                </span>
              )}
            </label>
            <input
              type="date"
              value={anniversary}
              onChange={(e) => handleAnniversaryChange(e.target.value)}
              className="w-full text-sm border border-stone-200 rounded-lg px-3 py-1.5 text-stone-900 focus:outline-none focus:ring-1 focus:ring-[#9F1239]/30 focus:border-[#9F1239]/30"
            />
          </div>
        </div>
      </Section>
    </>
  );
}
