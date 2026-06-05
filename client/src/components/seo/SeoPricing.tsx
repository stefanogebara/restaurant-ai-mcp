/**
 * SeoPricing â€” competitor comparison + Seatable pricing.
 * Shows a feature comparison table and the three plans.
 *
 * NOTE: SEO pages are exclusively PT-BR content targeting the Brazilian market,
 * so the comparison table and feature labels remain hardcoded in Portuguese.
 * Prices use the BRL plan prices from planFeatures.
 */

import { Check, X, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { SeoPageData } from '../../data/seoPages';
import { PLAN_PRICES_BRL } from '../../config/planFeatures';
import { formatPriceLocale } from '../../utils/currency';

interface SeoPricingProps {
  readonly page: SeoPageData;
}

const COMPARISON_FEATURES = [
  'Reservas via WhatsApp AI',
  'Agente de voz 24/7',
  'PrevisÃ£o de no-show (ML)',
  'Fila de espera digital',
  'Dashboard em tempo real',
  'DepÃ³sito antecipado',
  'Suporte em portuguÃªs',
  'Sem taxa por reserva',
];

const COMPETITORS: Record<string, readonly boolean[]> = {
  'Caderno/Excel':     [false, false, false, false, false, false, true,  true],
  'WhatsApp manual':   [false, false, false, false, false, false, true,  true],
  'OpenTable':         [false, false, false, true,  true,  false, false, false],
  'Seatable':          [true,  true,  true,  true,  true,  true,  true,  true],
};

const PLANS = [
  {
    name: 'Essencial',
    price: formatPriceLocale(PLAN_PRICES_BRL.starter, 'BRL'),
    period: '/mÃªs',
    features: [
      'AtÃ© 50 reservas/mÃªs',
      'WhatsApp AI',
      'Dashboard bÃ¡sico',
      'Suporte por email',
      'Fila de espera digital',
    ],
    cta: 'ComeÃ§ar com Essencial',
    highlighted: false,
  },
  {
    name: 'Profissional',
    price: formatPriceLocale(PLAN_PRICES_BRL.growth, 'BRL'),
    period: '/mÃªs',
    features: [
      'AtÃ© 150 reservas/mÃªs',
      'WhatsApp + Voz AI',
      'Analytics avanÃ§ado',
      'PrevisÃ£o de no-show',
      'Suporte prioritÃ¡rio',
      '14 dias grÃ¡tis',
    ],
    cta: 'Teste 14 dias grÃ¡tis',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: formatPriceLocale(PLAN_PRICES_BRL.scale, 'BRL'),
    period: '/mÃªs',
    features: [
      'Reservas ilimitadas',
      'Todas as funcionalidades',
      'IntegraÃ§Ãµes customizadas',
      'Suporte dedicado',
      'SMS ilimitado',
      'Multi-unidade',
    ],
    cta: 'Falar com vendas',
    highlighted: false,
  },
];

export default function SeoPricing({ page }: SeoPricingProps) {
  return (
    <section className="py-16 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <h2 className="font-serif text-2xl sm:text-3xl font-bold text-deep-charcoal mb-3 text-center">
          Seatable vs. o que {page.cuisine.toLowerCase()} usam hoje
        </h2>
        <p className="text-warm-stone text-center mb-12 max-w-2xl mx-auto">
          Compare com as alternativas que {page.cuisine.toLowerCase()} em{' '}
          {page.city} geralmente usam:{' '}
          {page.competitors.join(', ').toLowerCase()}.
        </p>

        {/* Comparison table */}
        <div className="overflow-x-auto mb-16">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr>
                <th className="text-left py-3 px-4 text-warm-stone font-medium border-b border-glass-border-dark">
                  Funcionalidade
                </th>
                {Object.keys(COMPETITORS).map((name) => (
                  <th
                    key={name}
                    className={`py-3 px-4 text-center font-semibold border-b border-glass-border-dark ${
                      name === 'Seatable' ? 'text-burgundy bg-burgundy/5' : 'text-deep-charcoal'
                    }`}
                  >
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARISON_FEATURES.map((feature, i) => (
                <tr key={feature}>
                  <td className="py-3 px-4 text-deep-charcoal border-b border-glass-border-dark">
                    {feature}
                  </td>
                  {Object.entries(COMPETITORS).map(([name, values]) => (
                    <td
                      key={name}
                      className={`py-3 px-4 text-center border-b border-glass-border-dark ${
                        name === 'Seatable' ? 'bg-burgundy/5' : ''
                      }`}
                    >
                      {values[i] ? (
                        <Check className="w-5 h-5 text-green-600 mx-auto" />
                      ) : (
                        <X className="w-5 h-5 text-stone-300 mx-auto" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pricing cards */}
        <h3 className="font-serif text-xl sm:text-2xl font-bold text-deep-charcoal mb-8 text-center">
          Planos para {page.cuisine.toLowerCase()} de todos os tamanhos
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl p-6 ${
                plan.highlighted
                  ? 'border-2 border-burgundy bg-burgundy/5'
                  : 'border border-glass-border-dark bg-white'
              }`}
            >
              {plan.highlighted && (
                <p className="text-xs font-semibold text-burgundy uppercase tracking-wide mb-3">
                  Mais popular
                </p>
              )}
              <h4 className="text-lg font-bold text-deep-charcoal mb-1">
                {plan.name}
              </h4>
              <p className="mb-4">
                <span className="text-2xl font-bold text-deep-charcoal">
                  {plan.price}
                </span>
                <span className="text-warm-stone text-sm">{plan.period}</span>
              </p>
              <ul className="space-y-2 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-warm-stone">
                    <Check className="w-4 h-4 text-burgundy flex-shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                to="/demo/setup"
                className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold transition-colors ${
                  plan.highlighted
                    ? 'bg-burgundy hover:bg-burgundy-dark text-white'
                    : 'border border-glass-border-dark hover:border-burgundy text-deep-charcoal'
                }`}
              >
                {plan.cta}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
