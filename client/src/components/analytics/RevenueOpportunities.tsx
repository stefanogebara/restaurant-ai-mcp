import { useTranslation } from 'react-i18next';
import { useRevenueOpportunities } from '../../hooks/usePredictiveAnalytics';

const CATEGORY_I18N: Record<string, Record<string, string>> = {
  'pt-BR': {
    'Off-Peak Optimization': 'Horários de menor movimento',
    'Table Turnover': 'Giro de mesas',
    'No-Show Reduction': 'Cancelamentos e faltas',
    'Revenue Per Cover': 'Receita por cliente',
    Upselling: 'Receita por cliente',
  },
  es: {
    'Off-Peak Optimization': 'Horarios de menor demanda',
    'Table Turnover': 'Rotación de mesas',
    'No-Show Reduction': 'Cancelaciones y ausencias',
    'Revenue Per Cover': 'Ingresos por cliente',
    Upselling: 'Ingresos por cliente',
  },
};

const DESCRIPTION_I18N: Record<string, Record<string, string>> = {
  'pt-BR': {
    'Implement confirmation reminders and deposits to reduce no-shows': 'Revisar lembretes e a política de sinal para reduzir cancelamentos e faltas.',
    'Fill empty tables during slow hours with promotions': 'Explorar formas de preencher horários de menor movimento.',
    'Improve table turnover rate during peak hours': 'Revisar o ritmo do serviço nos horários mais movimentados.',
    'Increase average revenue per customer through upselling': 'Explorar sugestões de menu relevantes para cada cliente.',
  },
  es: {
    'Implement confirmation reminders and deposits to reduce no-shows': 'Revisar recordatorios y la política de depósitos para reducir cancelaciones y ausencias.',
    'Fill empty tables during slow hours with promotions': 'Explorar formas de llenar horarios de menor demanda.',
    'Improve table turnover rate during peak hours': 'Revisar el ritmo del servicio en las horas más concurridas.',
    'Increase average revenue per customer through upselling': 'Explorar recomendaciones de menú relevantes para cada cliente.',
  },
};

export default function RevenueOpportunities() {
  const { t, i18n } = useTranslation();
  const language = i18n.language.startsWith('pt') ? 'pt-BR' : i18n.language.startsWith('es') ? 'es' : 'en';
  const { data, isLoading, isError } = useRevenueOpportunities();
  const opportunities = data?.opportunities ?? [];
  const translate = (dictionary: Record<string, Record<string, string>>, value: string) =>
    dictionary[language]?.[value] ?? value;

  if (isLoading) {
    return <p role="status" className="py-8 text-sm text-muted-stone">{t('analytics.analyzingOpportunities')}</p>;
  }

  // This is supplementary analysis; an empty or unavailable model should not
  // end the report with a prominent non-actionable module.
  if (isError || opportunities.length === 0) return null;

  return (
    <section>
      <header className="border-b hairline pb-4">
        <h2 className="font-sans text-[16px] font-medium text-deep-charcoal">
          {t('analytics.revenueHypotheses', 'Revenue experiments')}
        </h2>
        <p className="text-[15px] text-muted-stone mt-1.5 max-w-3xl">
          {t('analytics.revenueHypothesesDesc', 'Ideas from a separate 30-day heuristic using booking history, configured capacity and assumed spend. Financial projections are withheld until the model can validate them against recorded sales.')}
        </p>
      </header>

      <div className="divide-y hairline">
        {opportunities.map(opp => (
          <div key={opp.rank} className="py-5">
            <h3 className="font-serif text-[21px] leading-tight text-deep-charcoal">
              {translate(CATEGORY_I18N, opp.category)}
            </h3>
            <p className="text-sm text-muted-stone mt-1">
              {translate(DESCRIPTION_I18N, opp.description)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
