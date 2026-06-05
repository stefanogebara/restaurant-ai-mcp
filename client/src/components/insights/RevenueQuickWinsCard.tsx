import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import { useRevenueOpportunities } from '../../hooks/usePredictiveAnalytics';
import { formatCurrency } from '../../utils/currency';

// Translate backend-generated category/description/action/timeline keys on the frontend
const CATEGORY_I18N: Record<string, Record<string, string>> = {
  'pt-BR': {
    'Off-Peak Optimization': 'OtimizaÃ§Ã£o Fora de Pico',
    'Table Turnover': 'Rotatividade de Mesas',
    'No-Show Reduction': 'ReduÃ§Ã£o de No-Shows',
    'Revenue Per Cover': 'Receita por Couvert',
  },
  es: {
    'Off-Peak Optimization': 'OptimizaciÃ³n Fuera de Pico',
    'Table Turnover': 'RotaciÃ³n de Mesas',
    'No-Show Reduction': 'ReducciÃ³n de No-Shows',
    'Revenue Per Cover': 'Ingreso por Cubierto',
  },
};

const DESC_I18N: Record<string, Record<string, string>> = {
  'pt-BR': {
    'Implement confirmation reminders and deposits to reduce no-shows': 'Implemente lembretes de confirmaÃ§Ã£o e depÃ³sitos para reduzir no-shows',
    'Fill empty tables during slow hours with promotions': 'Preencha mesas vazias em horÃ¡rios de baixa com promoÃ§Ãµes',
    'Improve table turnover rate during peak hours': 'Melhore a rotatividade de mesas nos horÃ¡rios de pico',
    'Increase average revenue per customer through upselling': 'Aumente a receita mÃ©dia por cliente com upselling',
  },
  es: {
    'Implement confirmation reminders and deposits to reduce no-shows': 'Implemente recordatorios de confirmaciÃ³n y depÃ³sitos para reducir no-shows',
    'Fill empty tables during slow hours with promotions': 'Llene mesas vacÃ­as en horas de baja con promociones',
    'Improve table turnover rate during peak hours': 'Mejore la rotaciÃ³n de mesas en horas pico',
    'Increase average revenue per customer through upselling': 'Aumente el ingreso promedio por cliente con upselling',
  },
};

const ACTION_I18N: Record<string, Record<string, string>> = {
  'pt-BR': {
    'Send SMS reminders 24h before reservation': 'Enviar lembretes SMS 24h antes da reserva',
    'Require credit card for parties of 6+': 'Exigir cartÃ£o de crÃ©dito para grupos de 6+',
    'Implement waitlist for last-minute fills': 'Implementar lista de espera para preencher cancelamentos',
    'Call high-risk reservations to confirm': 'Ligar para reservas de alto risco para confirmar',
    'Early bird special (5-6:30 PM): 15% off': 'Desconto antecipado (17h-18h30): 15% off',
    'Weekday lunch promotion': 'PromoÃ§Ã£o de almoÃ§o durante a semana',
    'Happy hour menu extension': 'ExtensÃ£o do cardÃ¡pio de happy hour',
    'Partner with local offices for lunch programs': 'Parcerias com escritÃ³rios locais para programas de almoÃ§o',
    'Optimize menu for faster service': 'Otimizar cardÃ¡pio para serviÃ§o mais rÃ¡pido',
    'Implement pre-ordering for large parties': 'Implementar prÃ©-pedido para grupos grandes',
    'Streamline payment process (QR code menus)': 'Agilizar pagamento (cardÃ¡pio por QR code)',
    'Better kitchen-floor communication': 'Melhorar comunicaÃ§Ã£o entre cozinha e salÃ£o',
    'Train staff on wine pairing suggestions': 'Treinar equipe em sugestÃµes de harmonizaÃ§Ã£o de vinhos',
    'Highlight premium menu items': 'Destacar itens premium do cardÃ¡pio',
    'Offer tasting menus for special occasions': 'Oferecer menus degustaÃ§Ã£o para ocasiÃµes especiais',
    'Dessert and after-dinner drink promotions': 'PromoÃ§Ãµes de sobremesas e drinks pÃ³s-jantar',
  },
  es: {
    'Send SMS reminders 24h before reservation': 'Enviar recordatorios SMS 24h antes de la reserva',
    'Require credit card for parties of 6+': 'Exigir tarjeta de crÃ©dito para grupos de 6+',
    'Implement waitlist for last-minute fills': 'Implementar lista de espera para cubrir cancelaciones',
    'Call high-risk reservations to confirm': 'Llamar a reservas de alto riesgo para confirmar',
    'Early bird special (5-6:30 PM): 15% off': 'Descuento anticipado (17h-18h30): 15% off',
    'Weekday lunch promotion': 'PromociÃ³n de almuerzo entre semana',
    'Happy hour menu extension': 'ExtensiÃ³n del menÃº de happy hour',
    'Partner with local offices for lunch programs': 'Alianzas con oficinas locales para programas de almuerzo',
    'Optimize menu for faster service': 'Optimizar el menÃº para un servicio mÃ¡s rÃ¡pido',
    'Implement pre-ordering for large parties': 'Implementar pre-pedidos para grupos grandes',
    'Streamline payment process (QR code menus)': 'Agilizar el pago (menÃºs con cÃ³digo QR)',
    'Better kitchen-floor communication': 'Mejorar la comunicaciÃ³n entre cocina y salÃ³n',
    'Train staff on wine pairing suggestions': 'Capacitar al personal en sugerencias de maridaje de vinos',
    'Highlight premium menu items': 'Destacar los platos premium del menÃº',
    'Offer tasting menus for special occasions': 'Ofrecer menÃºs de degustaciÃ³n para ocasiones especiales',
    'Dessert and after-dinner drink promotions': 'Promociones de postres y tragos de sobremesa',
  },
};

const TIMELINE_I18N: Record<string, Record<string, string>> = {
  'pt-BR': {
    '1-2 weeks': '1-2 semanas',
    '2-4 weeks': '2-4 semanas',
    '4-6 weeks': '4-6 semanas',
  },
  es: {
    '1-2 weeks': '1-2 semanas',
    '2-4 weeks': '2-4 semanas',
    '4-6 weeks': '4-6 semanas',
  },
};

export default function RevenueQuickWinsCard() {
  const { t, i18n } = useTranslation();
  const { data, isLoading } = useRevenueOpportunities();
  const tCat = (cat: string) => CATEGORY_I18N[i18n.language]?.[cat] ?? cat;
  const tDesc = (desc: string) => DESC_I18N[i18n.language]?.[desc] ?? desc;
  const tAction = (action: string) => ACTION_I18N[i18n.language]?.[action] ?? action;
  const tTimeline = (tl: string) => TIMELINE_I18N[i18n.language]?.[tl] ?? tl;
  // Track the expanded card by its stable `rank`, not array index â€” the
  // opportunities list comes from a poll and can reorder between fetches.
  // `null` = nothing toggled yet (first card open by default); -1 = the user
  // explicitly collapsed everything.
  const [expandedRank, setExpandedRank] = useState<number | null>(null);

  const opportunities = (data?.opportunities ?? []).slice(0, 3);
  const activeRank = expandedRank ?? opportunities[0]?.rank ?? null;

  if (isLoading) {
    return (
      <div className="py-6">
        <div className="h-4 w-40 bg-soft-gray rounded animate-pulse mb-3" />
        <div className="h-3 w-32 bg-soft-gray rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="border border-glass-border-dark rounded-lg overflow-hidden">
      <div className="p-5 border-b border-glass-border-dark flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-rose-50 flex items-center justify-center flex-shrink-0">
          <ThiingsIcon name="bar-chart" pxSize={16} className="text-rose-600" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-deep-charcoal">{t('insights.revenueQuickWins')}</h2>
          <p className="text-xs text-warm-stone">{t('insights.topOpportunities')}</p>
        </div>
        {data?.summary && (
          <div className="ml-auto text-right">
            <div className="text-sm font-bold text-rose-600">{formatCurrency(data.summary.estimated_monthly_impact)}</div>
            <div className="text-xs text-warm-stone">{t('insights.monthPotential')}</div>
          </div>
        )}
      </div>

      <div className="p-5 space-y-2">
        {opportunities.length === 0 ? (
          <p className="text-sm text-warm-stone text-center py-4">{t('analytics.noOpportunities')}</p>
        ) : (
          opportunities.map((opp) => {
            const isExpanded = activeRank === opp.rank;
            return (
            <div key={opp.rank} className="border border-glass-border-dark rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setExpandedRank(isExpanded ? -1 : opp.rank)}
                className="w-full flex items-center gap-3 p-4 text-left hover:bg-soft-gray/30 transition-colors"
              >
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${opp.priority === 'high' ? 'bg-red-500' : opp.priority === 'medium' ? 'bg-amber-500' : 'bg-rose-500'}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-deep-charcoal">{tCat(opp.category)}</div>
                  <div className="text-xs text-warm-stone truncate">{tDesc(opp.description)}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-sm font-bold text-rose-600">+{formatCurrency(opp.potential_gain)}</div>
                  <div className="text-xs text-warm-stone">{tTimeline(opp.estimated_timeline)}</div>
                </div>
                <ThiingsIcon
                  name="chevron-down"
                  pxSize={16}
                  className={`text-warm-stone flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                />
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 pt-0 border-t border-glass-border-dark bg-soft-gray/20">
                  <p className="text-xs font-semibold text-deep-charcoal mb-2 pt-3">{t('insights.actions')}</p>
                  <ul className="space-y-1.5">
                    {(opp.actions ?? []).map((action, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-stone-gray">
                        <span className="text-burgundy mt-0.5 flex-shrink-0">â€¢</span>
                        <span>{tAction(action)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            );
          })
        )}
      </div>
    </div>
  );
}
