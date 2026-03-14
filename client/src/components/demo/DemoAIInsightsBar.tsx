import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';

interface DemoAIInsightsBarProps {
  restaurantName: string;
  occupiedTables: number;
  totalTables: number;
  reservationsToday: number;
  waitlistCount: number;
  totalGuests: number;
  lang: string;
}

interface Insight {
  id: string;
  text: string;
}

const cannedResponses = {
  en: [
    'Based on current trends, tonight should peak around 19:30. Consider pre-setting tables for large parties.',
    'Your average table turn time this week is 52 minutes. That is 8% faster than last week.',
    'I recommend checking on Table 5 -- they have been seated for over 90 minutes without ordering dessert.',
  ],
  'pt-BR': [
    'Com base nas tendencias atuais, o pico de hoje deve ser por volta das 19:30. Considere preparar mesas para grupos grandes.',
    'O tempo medio de rotacao de mesa esta semana e de 52 minutos. Isso e 8% mais rapido que na semana passada.',
    'Recomendo verificar a Mesa 5 -- estao sentados ha mais de 90 minutos sem pedir sobremesa.',
  ],
} as const;

const labels = {
  en: {
    title: 'AI Insights',
    askPlaceholder: 'Ask AI anything...',
    viewForecast: 'View forecast',
    generateBriefing: 'Generate briefing',
    toastForecast: 'Forecast available in the full version',
    toastBriefing: 'Briefing available in the full version',
  },
  'pt-BR': {
    title: 'Insights IA',
    askPlaceholder: 'Pergunte qualquer coisa...',
    viewForecast: 'Ver previsao',
    generateBriefing: 'Gerar briefing',
    toastForecast: 'Previsao disponivel na versao completa',
    toastBriefing: 'Briefing disponivel na versao completa',
  },
} as const;

function buildInsights(
  props: Omit<DemoAIInsightsBarProps, 'lang'>,
  lang: string,
): Insight[] {
  const { occupiedTables, totalTables, reservationsToday, waitlistCount, totalGuests } = props;
  const occupancy = totalTables > 0 ? Math.round((occupiedTables / totalTables) * 100) : 0;
  const available = totalTables - occupiedTables;
  const hour = new Date().getHours();
  const insights: Insight[] = [];

  if (lang === 'pt-BR') {
    // Capacity insight
    if (occupancy >= 80) {
      insights.push({ id: 'cap', text: `Hoje esta ${occupancy}% lotado — considere abrir o patio para walk-ins (${available} mesa${available !== 1 ? 's' : ''} livre${available !== 1 ? 's' : ''}).` });
    } else if (occupancy >= 50) {
      insights.push({ id: 'cap', text: `Ocupacao em ${occupancy}% com ${available} mesa${available !== 1 ? 's' : ''} disponiveis. Noite movimentada com ${reservationsToday} reservas.` });
    } else {
      insights.push({ id: 'cap', text: `Ocupacao tranquila em ${occupancy}% — ${available} mesa${available !== 1 ? 's' : ''} livres. Bom momento para aceitar walk-ins.` });
    }

    // Staffing suggestion
    if (hour >= 18 && hour <= 21) {
      const suggestedServers = Math.max(2, Math.ceil(totalGuests / 8));
      insights.push({ id: 'staff', text: `Horario de pico ${hour}:00-${hour + 1}:30 — sugiro ${suggestedServers} garcons no salao para ${totalGuests} clientes.` });
    }

    // Waitlist insight
    if (waitlistCount > 0) {
      insights.push({ id: 'wait', text: `${waitlistCount} grupo${waitlistCount !== 1 ? 's' : ''} na lista de espera. Tempo estimado: ${waitlistCount * 12}-${waitlistCount * 18} min.` });
    }
  } else {
    // Capacity insight
    if (occupancy >= 80) {
      insights.push({ id: 'cap', text: `Tonight is ${occupancy}% booked — consider opening the patio for walk-ins (${available} table${available !== 1 ? 's' : ''} free).` });
    } else if (occupancy >= 50) {
      insights.push({ id: 'cap', text: `Occupancy at ${occupancy}% with ${available} table${available !== 1 ? 's' : ''} available. Busy evening ahead with ${reservationsToday} reservations.` });
    } else {
      insights.push({ id: 'cap', text: `Light occupancy at ${occupancy}% — ${available} table${available !== 1 ? 's' : ''} free. Good time to accept walk-ins.` });
    }

    // Staffing suggestion
    if (hour >= 18 && hour <= 21) {
      const suggestedServers = Math.max(2, Math.ceil(totalGuests / 8));
      insights.push({ id: 'staff', text: `Peak hour ${hour}:00-${hour + 1}:30 — suggest adding ${suggestedServers} server${suggestedServers !== 1 ? 's' : ''} for ${totalGuests} guests.` });
    }

    // Waitlist insight
    if (waitlistCount > 0) {
      insights.push({ id: 'wait', text: `${waitlistCount} part${waitlistCount !== 1 ? 'ies' : 'y'} on the waitlist. Estimated wait: ${waitlistCount * 12}-${waitlistCount * 18} min.` });
    }
  }

  return insights;
}

const SparkleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 1L9.5 6.5L15 8L9.5 9.5L8 15L6.5 9.5L1 8L6.5 6.5L8 1Z" fill="currentColor" />
  </svg>
);

const SendIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

export default function DemoAIInsightsBar({
  restaurantName,
  occupiedTables,
  totalTables,
  reservationsToday,
  waitlistCount,
  totalGuests,
  lang,
}: DemoAIInsightsBarProps) {
  const [query, setQuery] = useState('');
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const langKey = lang === 'pt-BR' ? 'pt-BR' : 'en';
  const ui = labels[langKey];

  const insights = useMemo(
    () => buildInsights({ restaurantName, occupiedTables, totalTables, reservationsToday, waitlistCount, totalGuests }, lang),
    [restaurantName, occupiedTables, totalTables, reservationsToday, waitlistCount, totalGuests, lang],
  );

  const handleAsk = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    const responses = cannedResponses[langKey];
    const idx = query.length % responses.length;
    setAiResponse(responses[idx]);
    setQuery('');
    setTimeout(() => setAiResponse(null), 6000);
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="bg-white border border-border-gray rounded-2xl p-5 shadow-sm relative"
      data-testid="ai-insights-bar"
    >
      {/* Toast */}
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="absolute top-2 right-4 bg-deep-charcoal text-white text-xs px-3 py-1.5 rounded-lg shadow-md z-10"
        >
          {toast}
        </motion.div>
      )}

      <div className="flex flex-col lg:flex-row lg:items-start gap-4">
        {/* Left: Insights */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-burgundy"><SparkleIcon /></span>
            <h3 className="text-sm font-semibold text-deep-charcoal">{ui.title}</h3>
          </div>

          <ul className="space-y-2">
            {insights.map((insight) => (
              <li key={insight.id} className="flex items-start gap-2.5 text-[13px] leading-relaxed text-stone-gray">
                <span className="w-1.5 h-1.5 rounded-full bg-burgundy mt-1.5 flex-shrink-0" />
                <span>{insight.text}</span>
              </li>
            ))}
          </ul>

          {/* AI Response */}
          {aiResponse && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-3 px-3 py-2 bg-burgundy/5 border border-burgundy/10 rounded-xl text-[13px] text-deep-charcoal leading-relaxed"
            >
              {aiResponse}
            </motion.div>
          )}
        </div>

        {/* Right: Quick Actions */}
        <div className="flex flex-col gap-2.5 lg:w-56 flex-shrink-0">
          <form onSubmit={handleAsk} className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={ui.askPlaceholder}
              className="w-full pl-3.5 pr-9 py-2 bg-stone-50 border border-border-gray rounded-xl text-[13px] text-deep-charcoal placeholder-muted-stone focus:outline-none focus:ring-2 focus:ring-burgundy/30"
            />
            <button
              type="submit"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-stone hover:text-burgundy transition-colors"
              aria-label={langKey === 'pt-BR' ? 'Enviar' : 'Send'}
            >
              <SendIcon />
            </button>
          </form>

          <button
            type="button"
            onClick={() => showToast(ui.toastForecast)}
            className="text-left text-[13px] font-medium text-burgundy hover:underline underline-offset-2 transition-colors"
          >
            {ui.viewForecast} &rarr;
          </button>
          <button
            type="button"
            onClick={() => showToast(ui.toastBriefing)}
            className="text-left text-[13px] font-medium text-burgundy hover:underline underline-offset-2 transition-colors"
          >
            {ui.generateBriefing} &rarr;
          </button>
        </div>
      </div>
    </motion.div>
  );
}
