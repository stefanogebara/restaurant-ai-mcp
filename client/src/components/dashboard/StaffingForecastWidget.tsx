import { useTranslation } from 'react-i18next';
import { useStaffingForecast } from '../../hooks/useStaffingForecast';

export default function StaffingForecastWidget() {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language?.startsWith('pt') ? 'pt-BR' : i18n.language === 'es' ? 'es-ES' : 'en-US';
  const { data: forecast, isLoading, isError } = useStaffingForecast();

  if (isLoading) {
    return (
      <div className="bg-white border border-border-gray rounded-2xl p-6 animate-pulse space-y-3">
        <div className="h-4 bg-gray-100 rounded w-40" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-12 bg-gray-100 rounded" />
        ))}
      </div>
    );
  }

  return (
    <div className="bg-white border border-border-gray rounded-2xl p-6 space-y-4">
      <h2 className="text-sm font-semibold text-deep-charcoal uppercase tracking-wider">
        {t('dashboard.staffingForecast')}
      </h2>

      {isError && (
        <p className="text-sm text-warm-stone">{t('dashboard.staffingForecastEmpty')}</p>
      )}

      {!isError && forecast && forecast.length === 0 && (
        <p className="text-sm text-warm-stone">{t('dashboard.staffingForecastEmpty')}</p>
      )}

      {forecast && forecast.length > 0 && (
        <div className="space-y-3">
          {forecast.map((day) => (
            <div key={day.date} className="flex items-start justify-between gap-4">
              <div className="min-w-[44px]">
                <span className="text-sm font-semibold text-deep-charcoal">
                  {new Date(day.date + 'T12:00:00Z').toLocaleDateString(dateLocale, { weekday: 'short', timeZone: 'UTC' })}
                </span>
                <span className="block text-xs text-warm-stone">
                  {new Date(day.date + 'T12:00:00Z').toLocaleDateString(dateLocale, {
                    month: 'short',
                    day: 'numeric',
                    timeZone: 'UTC',
                  })}
                </span>
              </div>

              <div className="flex-1">
                <p className="text-xs text-warm-stone mb-1">{day.expected_covers} {t('dashboard.covers')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {day.roles.map((role) => (
                    <span
                      key={role.name}
                      className="inline-flex items-center gap-1 bg-soft-gray rounded-full px-2 py-0.5 text-xs text-deep-charcoal"
                    >
                      <span className="font-medium truncate">{role.name}</span>
                      <span className="text-warm-stone">×{role.recommended}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
