import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import { useRevenueOpportunities } from '../../hooks/usePredictiveAnalytics';
import { formatCurrency } from '../../utils/currency';

// Translate backend-generated category/description/action/timeline keys on the frontend
const CATEGORY_I18N: Record<string, Record<string, string>> = {
  'pt-BR': {
    'Off-Peak Optimization': 'Otimização Fora de Pico',
    'Table Turnover': 'Rotatividade de Mesas',
    'No-Show Reduction': 'Redução de No-Shows',
    'Revenue Per Cover': 'Receita por Couvert',
  },
  es: {
    'Off-Peak Optimization': 'Optimización Fuera de Pico',
    'Table Turnover': 'Rotación de Mesas',
    'No-Show Reduction': 'Reducción de No-Shows',
    'Revenue Per Cover': 'Ingreso por Cubierto',
  },
};

const DESC_I18N: Record<string, Record<string, string>> = {
  'pt-BR': {
    'Implement confirmation reminders and deposits to reduce no-shows': 'Implemente lembretes de confirmação e depósitos para reduzir no-shows',
    'Fill empty tables during slow hours with promotions': 'Preencha mesas vazias em horários de baixa com promoções',
    'Improve table turnover rate during peak hours': 'Melhore a rotatividade de mesas nos horários de pico',
    'Increase average revenue per customer through upselling': 'Aumente a receita média por cliente com upselling',
  },
  es: {
    'Implement confirmation reminders and deposits to reduce no-shows': 'Implemente recordatorios de confirmación y depósitos para reducir no-shows',
    'Fill empty tables during slow hours with promotions': 'Llene mesas vacías en horas de baja con promociones',
    'Improve table turnover rate during peak hours': 'Mejore la rotación de mesas en horas pico',
    'Increase average revenue per customer through upselling': 'Aumente el ingreso promedio por cliente con upselling',
  },
};

const ACTION_I18N: Record<string, Record<string, string>> = {
  'pt-BR': {
    'Send SMS reminders 24h before reservation': 'Enviar lembretes SMS 24h antes da reserva',
    'Require credit card for parties of 6+': 'Exigir cartão de crédito para grupos de 6+',
    'Implement waitlist for last-minute fills': 'Implementar lista de espera para preencher cancelamentos',
    'Call high-risk reservations to confirm': 'Ligar para reservas de alto risco para confirmar',
    'Early bird special (5-6:30 PM): 15% off': 'Desconto antecipado (17h-18h30): 15% off',
    'Weekday lunch promotion': 'Promoção de almoço durante a semana',
    'Happy hour menu extension': 'Extensão do cardápio de happy hour',
    'Partner with local offices for lunch programs': 'Parcerias com escritórios locais para programas de almoço',
    'Optimize menu for faster service': 'Otimizar cardápio para serviço mais rápido',
    'Implement pre-ordering for large parties': 'Implementar pré-pedido para grupos grandes',
    'Streamline payment process (QR code menus)': 'Agilizar pagamento (cardápio por QR code)',
    'Better kitchen-floor communication': 'Melhorar comunicação entre cozinha e salão',
    'Train staff on wine pairing suggestions': 'Treinar equipe em sugestões de harmonização de vinhos',
    'Highlight premium menu items': 'Destacar itens premium do cardápio',
    'Offer tasting menus for special occasions': 'Oferecer menus degustação para ocasiões especiais',
    'Dessert and after-dinner drink promotions': 'Promoções de sobremesas e drinks pós-jantar',
  },
  es: {
    'Send SMS reminders 24h before reservation': 'Enviar recordatorios SMS 24h antes de la reserva',
    'Require credit card for parties of 6+': 'Exigir tarjeta de crédito para grupos de 6+',
    'Implement waitlist for last-minute fills': 'Implementar lista de espera para cubrir cancelaciones',
    'Call high-risk reservations to confirm': 'Llamar a reservas de alto riesgo para confirmar',
    'Early bird special (5-6:30 PM): 15% off': 'Descuento anticipado (17h-18h30): 15% off',
    'Weekday lunch promotion': 'Promoción de almuerzo entre semana',
    'Happy hour menu extension': 'Extensión del menú de happy hour',
    'Partner with local offices for lunch programs': 'Alianzas con oficinas locales para programas de almuerzo',
    'Optimize menu for faster service': 'Optimizar el menú para un servicio más rápido',
    'Implement pre-ordering for large parties': 'Implementar pre-pedidos para grupos grandes',
    'Streamline payment process (QR code menus)': 'Agilizar el pago (menús con código QR)',
    'Better kitchen-floor communication': 'Mejorar la comunicación entre cocina y salón',
    'Train staff on wine pairing suggestions': 'Capacitar al personal en sugerencias de maridaje de vinos',
    'Highlight premium menu items': 'Destacar los platos premium del menú',
    'Offer tasting menus for special occasions': 'Ofrecer menús de degustación para ocasiones especiales',
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
  // Track the expanded card by its stable `rank`, not array index — the
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
    <div className="border border-[#E5E7EB] rounded-lg overflow-hidden">
      <div className="p-5 border-b border-border-gray flex items-center gap-3">
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
            <div key={opp.rank} className="border border-border-gray rounded-xl overflow-hidden">
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
                <div className="px-4 pb-4 pt-0 border-t border-border-gray bg-soft-gray/20">
                  <p className="text-xs font-semibold text-deep-charcoal mb-2 pt-3">{t('insights.actions')}</p>
                  <ul className="space-y-1.5">
                    {(opp.actions ?? []).map((action, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-stone-gray">
                        <span className="text-burgundy mt-0.5 flex-shrink-0">•</span>
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
