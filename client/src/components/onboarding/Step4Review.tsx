/**
 * Step 4: Review & Launch
 *
 * Summary card showing all configured settings with edit links.
 * "Launch My Restaurant" CTA to complete onboarding.
 */

import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { OnboardingStepProps } from '../../types/onboarding.types';
import ThiingsIcon from '../common/ThiingsIcon';

interface Step4ReviewProps extends OnboardingStepProps {
  onComplete?: () => void;
  isSubmitting?: boolean;
  /** Estágio corrente da criação (G3.1). O clique mais comprometido do
   *  produto esperava 3-10s num "Configurando..." mudo, sem dizer o que
   *  estava acontecendo nem que podia demorar. */
  submitStage?: string | null;
  goToStep?: (step: number) => void;
}

// PhoneInput stores the number as `+<cc> <digits>` (e.g. "+55 11987654321").
// The review summary previously echoed that raw form — readable as "+55
// 11987654321" but visually jarring vs. the dial-code prefix box on Step 2.
// Pretty-print for display only with country-specific grouping. Some countries
// mix separators within a single number (BR: "11 98765-4321" — space after
// DDD, dash between the last two), so each rule is a callback that knows
// its country's convention.
type PhoneFormatter = (digits: string) => string | null;

const PHONE_FORMATTERS: Record<string, PhoneFormatter> = {
  // BR: DDD (2) + body. Mobile (11d) = "DD XXXXX-XXXX". Landline (10d) = "DD XXXX-XXXX".
  '+55': d => {
    if (d.length === 11) return `${d.slice(0, 2)} ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `${d.slice(0, 2)} ${d.slice(2, 6)}-${d.slice(6)}`;
    return null;
  },
  // AR: similar grouping
  '+54': d => {
    if (d.length === 11) return `${d.slice(0, 2)} ${d.slice(2, 6)}-${d.slice(6)}`;
    if (d.length === 10) return `${d.slice(0, 2)} ${d.slice(2, 6)}-${d.slice(6)}`;
    return null;
  },
  // MX
  '+52': d => d.length === 10 ? `${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6)}` : null,
  // IT: landline 02 XXXX XXXX (10), mobile 3XX XXX XXXX (9-10)
  '+39': d => {
    if (d.length === 10) return `${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6)}`;
    if (d.length === 9) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
    return null;
  },
  // ES: XXX XXX XXX
  '+34': d => d.length === 9 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : null,
  // FR: X XX XX XX XX
  '+33': d => d.length === 9
    ? `${d.slice(0, 1)} ${d.slice(1, 3)} ${d.slice(3, 5)} ${d.slice(5, 7)} ${d.slice(7)}`
    : null,
  // PT: XXX XXX XXX
  '+351': d => d.length === 9 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : null,
  // DE: variable, leading area code 2-5 digits — keep simple "XXX XXXXXXX" split
  '+49': d => d.length >= 10 ? `${d.slice(0, 3)} ${d.slice(3)}` : null,
  // GB: 4+6 or 4+7
  '+44': d => {
    if (d.length === 10) return `${d.slice(0, 4)} ${d.slice(4)}`;
    if (d.length === 11) return `${d.slice(0, 4)} ${d.slice(4)}`;
    return null;
  },
  // US/CA: (XXX) XXX-XXXX
  '+1': d => d.length === 10
    ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
    : null,
};

function formatPhoneForDisplay(raw: string): string {
  if (!raw) return '';
  // Allow internal whitespace in the digits part too — stored format is
  // canonical `+<cc> <digits>` but we shouldn't break on legacy values.
  const m = raw.match(/^(\+\d{1,3})\s*([\d\s-]+)$/);
  if (!m) return raw;
  const cc = m[1];
  const digits = m[2].replace(/\D/g, '');
  if (digits.length < 6) return `${cc} ${digits}`;

  const formatter = PHONE_FORMATTERS[cc];
  const formatted = formatter ? formatter(digits) : null;
  if (formatted) return `${cc} ${formatted}`;

  // Generic fallback: head-last4 with a dash.
  const last4 = digits.slice(-4);
  const middle = digits.slice(0, -4);
  return `${cc} ${middle}-${last4}`;
}

export default function Step4Review({ data, onBack, onComplete, isSubmitting, submitStage, goToStep }: Step4ReviewProps) {
  const { t, i18n } = useTranslation();

  // data.country stores the English data-file name ("Brazil") — fine for the
  // backend, wrong for display: the PT-BR review screen printed "Sao Paulo,
  // Brazil". Localize from the country code, display-only.
  const localizedCountry = (() => {
    if (!data.country_code) return data.country;
    try {
      const display = new Intl.DisplayNames([i18n.language || 'en'], { type: 'region' });
      return display.of(data.country_code.toUpperCase()) || data.country;
    } catch {
      return data.country;
    }
  })();

  const totalTables = data.areas.reduce((sum, area) => sum + area.tables.reduce((s, tbl) => s + tbl.count, 0), 0);
  const totalCapacity = data.areas.reduce((sum, area) => sum + area.tables.reduce((s, tbl) => s + tbl.capacity * tbl.count, 0), 0);

  const openDays = data.business_hours.filter(h => h.is_open).length;

  const sections = [
    {
      title: t('onboarding.sectionRestaurantInfo'),
      step: 1,
      items: [
        { label: t('onboarding.labelName'), value: data.restaurant_name },
        // Resolve the restaurant_type slug to its localized label, the same
        // way Step1 renders it — otherwise the review screen shows the raw
        // enum value ("fine-dining") instead of "Fine Dining" / "Alta Gastronomia".
        { label: t('onboarding.labelType'), value: t(`onboarding.restaurantTypes.${data.restaurant_type}`, data.restaurant_type) },
        { label: t('onboarding.labelLocation'), value: `${data.city}, ${localizedCountry}` },
      ],
    },
    {
      title: t('onboarding.sectionContactHours'),
      step: 2,
      items: [
        { label: t('onboarding.labelPhone'), value: formatPhoneForDisplay(data.phone_number) },
        { label: t('onboarding.labelEmail'), value: data.email },
        ...(data.website ? [{ label: t('onboarding.labelWebsite'), value: data.website }] : []),
        { label: t('onboarding.labelOpenDays'), value: t('onboarding.daysPerWeek', { count: openDays }) },
      ],
    },
    {
      title: t('onboarding.sectionTablesSettings'),
      step: 3,
      items: [
        { label: t('onboarding.labelAreas'), value: data.areas.map(a => a.name).join(', ') },
        { label: t('onboarding.labelTables'), value: t('onboarding.tablesAndSeats', { tables: totalTables, seats: totalCapacity }) },
        { label: t('onboarding.labelBookingWindow'), value: t('onboarding.daysValue', { count: data.advance_booking_days }) },
        { label: t('onboarding.labelBufferTime'), value: t('onboarding.minutesValue', { count: data.buffer_time }) },
      ],
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div>
        <h2 className="font-serif text-3xl text-deep-charcoal mb-2">{t('onboarding.step4Heading')}</h2>
        <p className="text-stone-gray text-sm">{t('onboarding.step4Subtitle')}</p>
      </div>

      {/* Summary Sections */}
      <div className="space-y-4">
        {sections.map((section) => (
          <div key={section.title} className="bg-soft-gray border border-glass-border-dark rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-deep-charcoal">{section.title}</h3>
              {goToStep && (
                <button
                  onClick={() => goToStep(section.step)}
                  className="text-xs font-medium text-burgundy hover:text-burgundy-dark transition-colors"
                >
                  {t('onboarding.edit')}
                </button>
              )}
            </div>
            <div className="space-y-2">
              {section.items.map((item) => (
                <div key={item.label} className="flex justify-between items-baseline">
                  <span className="text-sm text-warm-stone">{item.label}</span>
                  <span className="text-sm font-medium text-deep-charcoal text-right max-w-[60%] truncate">
                    {item.value || '-'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* AI & Voice Note */}
      <div className="bg-burgundy/5 border border-burgundy/20 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <ThiingsIcon name="info" pxSize={20} className="text-burgundy flex-shrink-0 mt-0.5" />
          <div className="text-sm text-stone-gray">
            <p className="font-medium text-deep-charcoal mb-1">{t('onboarding.afterLaunchTitle')}</p>
            <ul className="space-y-1">
              <li>{t('onboarding.afterLaunchVoice')}</li>
              <li>{t('onboarding.afterLaunchLearning')}</li>
              <li>{t('onboarding.afterLaunchTeam')}</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-between pt-4">
        <button
          onClick={onBack}
          className="px-6 py-3 bg-white/60 backdrop-blur-glass-chip hover:bg-white/85 border border-glass-border-dark text-deep-charcoal font-semibold rounded-xl transition-all flex items-center gap-2"
        >
          <ThiingsIcon name="chevron-left" pxSize={20} />
          {t('onboarding.back')}
        </button>
        <button
          onClick={onComplete}
          disabled={isSubmitting}
          className="px-8 py-3.5 bg-burgundy hover:bg-burgundy-dark disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold rounded-xl flex items-center gap-2 transition-all duration-300"
        >
          {isSubmitting ? (
            <>
              <div aria-hidden="true" className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span aria-live="polite">{submitStage || t('onboarding.settingUp')}</span>
            </>
          ) : (
            <>
              {t('onboarding.launchMyRestaurant')}
              <ThiingsIcon name="lightning" pxSize={20} />
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
}
