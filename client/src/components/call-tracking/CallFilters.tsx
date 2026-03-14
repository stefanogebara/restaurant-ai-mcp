import { useTranslation } from 'react-i18next';
import type { CallFilter } from './callTrackingTypes';

interface Props {
  filter: CallFilter;
  onChange: (filter: CallFilter) => void;
}

export default function CallFilters({ filter, onChange }: Props) {
  const { t } = useTranslation();

  const PERIOD_OPTIONS = [
    { value: '1d',  label: t('callTracking.twentyFourHours') },
    { value: '7d',  label: t('callTracking.sevenDays') },
    { value: '30d', label: t('callTracking.thirtyDays') },
    { value: '90d', label: t('callTracking.ninetyDays') },
  ] as const;

  return (
    <div className="bg-white rounded-2xl border border-border-gray overflow-hidden">
      <div className="flex flex-wrap items-center gap-4 sm:gap-6 px-4 sm:px-6 py-4">
        {/* Period */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-stone">{t('callTracking.period')}</span>
          <div className="flex gap-0">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                type="button"
                key={opt.value}
                onClick={() => onChange({ ...filter, period: opt.value })}
                className={`text-xs font-medium px-3 py-1.5 rounded-xl transition-colors ${
                  filter.period === opt.value
                    ? 'text-deep-charcoal bg-soft-gray'
                    : 'text-muted-stone hover:text-stone-gray'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Outcome */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-stone">{t('callTracking.outcome')}</span>
          <select
            aria-label={t('callTracking.outcome')}
            value={filter.outcome}
            onChange={(e) => onChange({ ...filter, outcome: e.target.value })}
            className="text-xs font-medium px-3 py-1.5 bg-soft-gray border-0 rounded-xl text-deep-charcoal cursor-pointer focus:outline-none focus:ring-2 focus:ring-burgundy/20"
          >
            <option value="all">{t('callTracking.outcomeAll')}</option>
            <option value="reservation_created">{t('callTracking.outcomeBooked')}</option>
            <option value="information_only">{t('callTracking.outcomeInfo')}</option>
            <option value="error">{t('callTracking.outcomeErrors')}</option>
            <option value="abandoned">{t('callTracking.outcomeAbandoned')}</option>
          </select>
        </div>

        {/* Language */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-stone">{t('callTracking.language')}</span>
          <select
            aria-label={t('callTracking.language')}
            value={filter.language}
            onChange={(e) => onChange({ ...filter, language: e.target.value })}
            className="text-xs font-medium px-3 py-1.5 bg-soft-gray border-0 rounded-xl text-deep-charcoal cursor-pointer focus:outline-none focus:ring-2 focus:ring-burgundy/20"
          >
            <option value="all">{t('callTracking.outcomeAll')}</option>
            <option value="en">EN</option>
            <option value="es">ES</option>
            <option value="pt">PT</option>
            <option value="fr">FR</option>
            <option value="it">IT</option>
          </select>
        </div>
      </div>
    </div>
  );
}
