import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import { useRevenueOpportunities } from '../../hooks/usePredictiveAnalytics';
import { formatCurrency } from '../../utils/currency';

// Translate backend-generated category/description keys on the frontend
const CATEGORY_I18N: Record<string, Record<string, string>> = {
  'pt-BR': {
    'Off-Peak Optimization': 'Otimização Fora de Pico',
    'Table Turnover': 'Rotatividade de Mesas',
    'No-Show Reduction': 'Redução de No-Shows',
  },
  es: {
    'Off-Peak Optimization': 'Optimización Fuera de Pico',
    'Table Turnover': 'Rotación de Mesas',
    'No-Show Reduction': 'Reducción de No-Shows',
  },
};

export default function RevenueQuickWinsCard() {
  const { t, i18n } = useTranslation();
  const { data, isLoading } = useRevenueOpportunities();
  const tCat = (cat: string) => CATEGORY_I18N[i18n.language]?.[cat] ?? cat;
  const [expanded, setExpanded] = useState<number | null>(0);

  const opportunities = (data?.opportunities ?? []).slice(0, 3);

  if (isLoading) {
    return (
      <div className="bg-white border border-border-gray/50 rounded-2xl p-6 shadow-sm">
        <div className="h-4 w-40 bg-soft-gray rounded animate-pulse mb-3" />
        <div className="h-3 w-32 bg-soft-gray rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="bg-white border border-border-gray/50 rounded-2xl overflow-hidden shadow-sm">
      <div className="p-5 border-b border-border-gray flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0">
          <ThiingsIcon name="bar-chart" pxSize={16} className="text-green-600" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-deep-charcoal">{t('insights.revenueQuickWins')}</h2>
          <p className="text-xs text-warm-stone">{t('insights.topOpportunities')}</p>
        </div>
        {data?.summary && (
          <div className="ml-auto text-right">
            <div className="text-sm font-bold text-green-600">{formatCurrency(data.summary.estimated_monthly_impact)}</div>
            <div className="text-xs text-warm-stone">{t('insights.monthPotential')}</div>
          </div>
        )}
      </div>

      <div className="p-5 space-y-2">
        {opportunities.length === 0 ? (
          <p className="text-sm text-warm-stone text-center py-4">{t('analytics.noOpportunities')}</p>
        ) : (
          opportunities.map((opp, index) => (
            <div key={index} className="border border-border-gray rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setExpanded(expanded === index ? null : index)}
                className="w-full flex items-center gap-3 p-4 text-left hover:bg-soft-gray/30 transition-colors"
              >
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${opp.priority === 'high' ? 'bg-red-500' : opp.priority === 'medium' ? 'bg-amber-500' : 'bg-green-500'}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-deep-charcoal">{tCat(opp.category)}</div>
                  <div className="text-xs text-warm-stone truncate">{opp.description}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-sm font-bold text-green-600">+{formatCurrency(opp.potential_gain)}</div>
                  <div className="text-xs text-warm-stone">{opp.estimated_timeline}</div>
                </div>
                <ThiingsIcon
                  name="chevron-down"
                  pxSize={16}
                  className={`text-warm-stone flex-shrink-0 transition-transform ${expanded === index ? 'rotate-180' : ''}`}
                />
              </button>

              {expanded === index && (
                <div className="px-4 pb-4 pt-0 border-t border-border-gray bg-soft-gray/20">
                  <p className="text-xs font-semibold text-deep-charcoal mb-2 pt-3">{t('insights.actions')}</p>
                  <ul className="space-y-1.5">
                    {opp.actions.map((action, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-stone-gray">
                        <span className="text-burgundy mt-0.5 flex-shrink-0">•</span>
                        <span>{action}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
