import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import { useRevenueOpportunities } from '../../hooks/usePredictiveAnalytics';
import { formatCurrency } from '../../utils/currency';

// Translate backend-generated category strings on the frontend
const CATEGORY_I18N: Record<string, Record<string, string>> = {
  'pt-BR': {
    'Off-Peak Optimization': 'Otimização Fora de Pico',
    'Table Turnover': 'Rotatividade de Mesas',
    'No-Show Reduction': 'Redução de No-Shows',
    'Upselling': 'Vendas Adicionais',
  },
  es: {
    'Off-Peak Optimization': 'Optimización Fuera de Pico',
    'Table Turnover': 'Rotación de Mesas',
    'No-Show Reduction': 'Reducción de No-Shows',
    'Upselling': 'Ventas Adicionales',
  },
};

// Translate backend-generated description strings on the frontend
const DESCRIPTION_I18N: Record<string, Record<string, string>> = {
  'pt-BR': {
    'Implement confirmation reminders and deposits to reduce no-shows': 'Implemente lembretes de confirmação e depósitos para reduzir no-shows',
    'Fill empty tables during slow hours with promotions': 'Preencha mesas vazias em horários de baixo movimento com promoções',
    'Improve table turnover rate during peak hours': 'Melhore a rotatividade de mesas nos horários de pico',
    'Increase average revenue per customer through upselling': 'Aumente a receita média por cliente com vendas adicionais',
  },
  es: {
    'Implement confirmation reminders and deposits to reduce no-shows': 'Implemente recordatorios de confirmación y depósitos para reducir ausencias',
    'Fill empty tables during slow hours with promotions': 'Llene mesas vacías en horas de baja demanda con promociones',
    'Improve table turnover rate during peak hours': 'Mejore la rotación de mesas en horas pico',
    'Increase average revenue per customer through upselling': 'Aumente los ingresos promedio por cliente con ventas adicionales',
  },
};

const PRIORITY_I18N: Record<string, Record<string, string>> = {
  'pt-BR': { high: 'Alto', medium: 'Médio', low: 'Baixo' },
  es: { high: 'Alto', medium: 'Medio', low: 'Bajo' },
};

const DIFFICULTY_I18N: Record<string, Record<string, string>> = {
  'pt-BR': { low: 'baixa', medium: 'média', high: 'alta' },
  es: { low: 'baja', medium: 'media', high: 'alta' },
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

// Backend-generated action steps — translated on the frontend, same set the
// RevenueQuickWinsCard maps. Without this the expanded action list rendered
// in raw English for pt-BR/es users.
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

export default function RevenueOpportunities() {
  const { t, i18n } = useTranslation();
  const tCat = (cat: string) => CATEGORY_I18N[i18n.language]?.[cat] ?? cat;
  const tDesc = (desc: string) => DESCRIPTION_I18N[i18n.language]?.[desc] ?? desc;
  const tPriority = (p: string) => PRIORITY_I18N[i18n.language]?.[p] ?? p.charAt(0).toUpperCase() + p.slice(1);
  const tDifficulty = (d: string) => DIFFICULTY_I18N[i18n.language]?.[d] ?? d;
  const tTimeline = (tl: string) => TIMELINE_I18N[i18n.language]?.[tl] ?? tl;
  const tAction = (action: string) => ACTION_I18N[i18n.language]?.[action] ?? action;
  const { data, isLoading, isError } = useRevenueOpportunities();
  const opportunities = data?.opportunities ?? [];
  const summary = data?.summary ?? null;
  const [expandedCard, setExpandedCard] = useState<number | null>(null);

  // Escala de prioridade e de dificuldade: 'low' usava rose (a cor de AÇÃO da
  // marca), então o item menos urgente e o mais fácil competiam com o CTA.
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-700';
      case 'medium': return 'bg-amber-600';
      case 'low': return 'bg-emerald-700';
      default: return 'bg-muted-stone';
    }
  };

  const getDifficultyBadge = (difficulty: string) => {
    switch (difficulty) {
      case 'low': return 'bg-emerald-600/[0.10] text-emerald-700';
      case 'medium': return 'bg-amber-600/[0.12] text-amber-700';
      case 'high': return 'bg-red-700/[0.10] text-red-700';
      default: return 'bg-muted-stone/[0.10] text-muted-stone';
    }
  };

  if (isLoading) {
    return (
      <div className="py-8">
        <div role="status" className="flex items-center justify-center">
          <div aria-hidden="true" className="w-8 h-8 border-4 border-burgundy border-t-transparent rounded-full animate-spin"></div>
          <span className="ml-3 text-muted-stone">{t('analytics.analyzingOpportunities')}</span>
        </div>
      </div>
    );
  }

  if (isError || (!isLoading && opportunities.length === 0 && !summary)) {
    return (
      <div className="py-8">
        <div className="text-center py-8">
          <ThiingsIcon name="lightbulb" pxSize={32} className="mx-auto mb-3 text-muted-stone" />
          <p className="font-serif text-[20px] text-deep-charcoal mb-1">{t('analytics.noRevenueData', 'No revenue data yet')}</p>
          <p className="text-sm text-muted-stone">{t('analytics.noRevenueDataDesc', 'Revenue opportunities will appear once there is enough booking history to analyze.')}</p>
        </div>
      </div>
    );
  }

  return (
    <section>
      <header className="border-b hairline pb-4">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone">
          {t('analytics.revenueOpportunities')}
        </h2>
        <p className="text-[15px] text-muted-stone mt-1.5">
          {t('analytics.revenueOpportunitiesDesc')}
        </p>
      </header>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 border-b hairline py-7">
          <div>
            <p className="font-serif text-[30px] leading-none text-burgundy tabular-nums">{formatCurrency(summary.total_potential_revenue)}</p>
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-stone mt-2.5">{t('analytics.totalPotential')}</p>
          </div>
          <div>
            <p className="font-serif text-[30px] leading-none text-deep-charcoal tabular-nums">{formatCurrency(summary.estimated_monthly_impact)}</p>
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-stone mt-2.5">{t('analytics.monthlyImpact')}</p>
          </div>
          <div>
            <p className="font-serif text-[30px] leading-none text-deep-charcoal tabular-nums">{summary.quick_wins}</p>
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-stone mt-2.5">{t('analytics.quickWins')}</p>
          </div>
          <div>
            <p className="font-serif text-[30px] leading-none text-red-700 tabular-nums">{summary.high_priority}</p>
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-stone mt-2.5">{t('analytics.highPriority')}</p>
          </div>
        </div>
      )}

      {/* Oportunidades: linhas no canvas. Antes cada uma era um cartão com
          borda contendo DOIS cartões de métrica aninhados — três níveis de
          caixa para uma frase e dois números. */}
      <div>
        {opportunities.map((opp) => (
          <div
            key={opp.rank}
            role="button"
            tabIndex={0}
            aria-expanded={expandedCard === opp.rank}
            className="py-5 border-b hairline cursor-pointer transition-colors hover:bg-deep-charcoal/[0.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-burgundy/30"
            onClick={() => setExpandedCard(expandedCard === opp.rank ? null : opp.rank)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedCard(expandedCard === opp.rank ? null : opp.rank); } }}
          >
            <div className="flex items-start gap-4">
              <span className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium text-white ${getPriorityColor(opp.priority)}`}>
                {opp.rank}
              </span>
              <div className="flex-1 min-w-0">
                <h3 className="font-serif text-[20px] leading-tight text-deep-charcoal">{tCat(opp.category)}</h3>
                <p className="text-sm text-muted-stone mt-1">{tDesc(opp.description)}</p>

                <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 mt-3">
                  <span className="flex items-baseline gap-2">
                    <span className="font-serif text-[24px] leading-none text-burgundy tabular-nums">{formatCurrency(opp.potential_gain)}</span>
                    <span className="text-[11px] uppercase tracking-[0.12em] text-muted-stone">
                      {t('analytics.potentialGain')} · {t('analytics.recoveryRate', { rate: opp.recovery_rate })}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-[13px] text-deep-charcoal">{tTimeline(opp.estimated_timeline)}</span>
                    <span className={`text-[11px] px-2.5 py-0.5 rounded-[46px] ${getDifficultyBadge(opp.implementation_difficulty)}`}>
                      {t('analytics.difficulty', { level: tDifficulty(opp.implementation_difficulty) })}
                    </span>
                  </span>
                </div>
              </div>
              <ThiingsIcon
                name="chevron-down"
                pxSize={18}
                className={`flex-shrink-0 mt-1 transition-transform ${expandedCard === opp.rank ? 'rotate-180' : ''}`}
              />
            </div>

            {expandedCard === opp.rank && (
              <div className="mt-4 pt-4 border-t hairline pl-12">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-stone mb-3">
                  {t('analytics.actionSteps')}
                </p>
                <ol className="space-y-2.5">
                  {(opp.actions ?? []).map((action, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-burgundy/[0.10] text-burgundy flex items-center justify-center text-[11px] font-medium mt-0.5">
                        {idx + 1}
                      </span>
                      <span className="flex-1 text-[15px] text-deep-charcoal">{tAction(action)}</span>
                    </li>
                  ))}
                </ol>
                <div className="mt-5 flex flex-wrap justify-between items-center gap-3">
                  <p className="text-xs text-muted-stone">
                    <span className="font-medium">{t('analytics.roiPotential')}</span> {tPriority(opp.priority)}
                  </p>
                  <button
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    className="px-5 py-2 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-medium rounded-[100px] transition-colors"
                  >
                    {t('analytics.startImplementation')}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="flex items-center gap-2 text-xs text-muted-stone pt-4">
        <ThiingsIcon name="lightbulb" pxSize={14} />
        <span>{t('analytics.opportunitiesFooter')}</span>
      </p>
    </section>
  );
}
