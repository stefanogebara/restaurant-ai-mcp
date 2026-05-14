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
  goToStep?: (step: number) => void;
}

export default function Step4Review({ data, onBack, onComplete, isSubmitting, goToStep }: Step4ReviewProps) {
  const { t } = useTranslation();
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
        { label: t('onboarding.labelLocation'), value: `${data.city}, ${data.country}` },
      ],
    },
    {
      title: t('onboarding.sectionContactHours'),
      step: 2,
      items: [
        { label: t('onboarding.labelPhone'), value: data.phone_number },
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
        <h2 className="font-serif text-2xl font-bold text-deep-charcoal mb-2">{t('onboarding.step4Heading')}</h2>
        <p className="text-stone-gray text-sm">{t('onboarding.step4Subtitle')}</p>
      </div>

      {/* Summary Sections */}
      <div className="space-y-4">
        {sections.map((section) => (
          <div key={section.title} className="bg-soft-gray border border-border-gray rounded-xl p-5">
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
          className="px-6 py-3 bg-white hover:bg-soft-gray border border-border-gray text-deep-charcoal font-semibold rounded-xl transition-all flex items-center gap-2"
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
              {t('onboarding.settingUp')}
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
