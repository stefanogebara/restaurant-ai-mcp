import { useTranslation } from 'react-i18next';
import { buildPreferencePills } from './weeklyReportHelpers';
import type { WeeklyReportData } from './weeklyReport.types';

interface WeeklyPreferencesPanelProps {
  preferences: WeeklyReportData['preferences'];
}

export default function WeeklyPreferencesPanel({ preferences }: WeeklyPreferencesPanelProps) {
  const { t } = useTranslation();
  const pills = buildPreferencePills(preferences);
  const topPillThreshold = pills.length > 3 ? pills[2]?.count : 0;

  return (
    <div className="overflow-hidden">
      <div className="flex items-center justify-between py-5 border-b border-[#E5E7EB]">
        <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone">{t('analytics.topGuestPreferences')}</span>
      </div>
      <div className="py-6">
        <div className="flex flex-wrap gap-2">
          {pills.map((pill) => (
            <span
              key={pill.label}
              className={`px-4 py-2 rounded-full text-[13px] font-medium border ${
                pill.count >= topPillThreshold
                  ? 'bg-burgundy/[6%] border-burgundy/15 text-burgundy font-semibold'
                  : 'bg-warm-white border-border-gray text-stone-gray'
              }`}
            >
              {pill.label} ({pill.count})
            </span>
          ))}
          {pills.length === 0 && (
            <p className="text-sm text-muted-stone">{t('analytics.noPreferenceData')}</p>
          )}
        </div>
      </div>
    </div>
  );
}
