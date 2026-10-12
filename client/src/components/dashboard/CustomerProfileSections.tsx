import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
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
      <h3 className="text-[11px] font-semibold text-muted-stone uppercase tracking-[0.12em] mb-2">
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
  const { t, i18n } = useTranslation();

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
      const updated: Record<string, string> = { ...specialOccasions, birthday: value };
      if (!value) {
        delete updated.birthday;
        onUpdateProfile({ customerId, special_occasions: updated });
      } else {
        onUpdateProfile({ customerId, special_occasions: updated });
      }
    },
    [customerId, specialOccasions, onUpdateProfile]
  );

  const handleAnniversaryChange = useCallback(
    (value: string) => {
      setAnniversary(value);
      const updated: Record<string, string> = { ...specialOccasions, anniversary: value };
      if (!value) {
        delete updated.anniversary;
        onUpdateProfile({ customerId, special_occasions: updated });
      } else {
        onUpdateProfile({ customerId, special_occasions: updated });
      }
    },
    [customerId, specialOccasions, onUpdateProfile]
  );

  const formatOccasionDisplay = (dateStr: string): string => {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString(i18n.language, { month: 'long', day: 'numeric' });
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
            <label htmlFor={`crm-birthday-${customerId}`} className="flex items-center gap-2 text-sm text-deep-charcoal mb-1">
              <ThiingsIcon name="calendar" pxSize={15} className="text-muted-stone" />
              {t('crm.birthday', 'Birthday')}
              {birthday && (
                <span className="text-xs text-muted-stone">
                  {formatOccasionDisplay(birthday)}
                </span>
              )}
            </label>
            <input
              id={`crm-birthday-${customerId}`}
              type="date"
              value={birthday}
              onChange={(e) => handleBirthdayChange(e.target.value)}
              className="w-full glass-pill rounded-xl px-3.5 py-2.5 text-sm text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/30"
            />
          </div>

          {/* Anniversary */}
          <div>
            <label htmlFor={`crm-anniversary-${customerId}`} className="flex items-center gap-2 text-sm text-deep-charcoal mb-1">
              <ThiingsIcon name="calendar" pxSize={15} className="text-muted-stone" />
              {t('crm.anniversary', 'Anniversary')}
              {anniversary && (
                <span className="text-xs text-muted-stone">
                  {formatOccasionDisplay(anniversary)}
                </span>
              )}
            </label>
            <input
              id={`crm-anniversary-${customerId}`}
              type="date"
              value={anniversary}
              onChange={(e) => handleAnniversaryChange(e.target.value)}
              className="w-full glass-pill rounded-xl px-3.5 py-2.5 text-sm text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/30"
            />
          </div>
        </div>
      </Section>
    </>
  );
}
