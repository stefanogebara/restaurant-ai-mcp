/**
 * SeoSolution — "How Seatable solves it" section.
 * Highlights WhatsApp AI, waitlist, no-show reduction, analytics.
 */

import { MessageSquare, Users, BarChart3, Phone, Shield, Zap } from 'lucide-react';
import type { SeoPageData } from '../../data/seoPages';

interface SeoSolutionProps {
  readonly page: SeoPageData;
}

const SOLUTIONS = [
  {
    icon: MessageSquare,
    title: 'IA no WhatsApp 24/7',
    description: 'Sua IA responde automaticamente no WhatsApp do restaurante, confirma horarios, faz reservas e envia lembretes. Sem intervenção humana.',
  },
  {
    icon: Users,
    title: 'Fila de espera digital',
    description: 'Clientes entram na fila pelo WhatsApp e recebem atualizações em tempo real. Sem fila na porta, sem desistências.',
  },
  {
    icon: BarChart3,
    title: 'Previsão de no-show com ML',
    description: 'Algoritmo de machine learning prevê a probabilidade de no-show por cliente e sugere overbooking inteligente para maximizar a ocupação.',
  },
  {
    icon: Phone,
    title: 'Agente de voz AI',
    description: 'Atende ligações automaticamente, entende sotaques e faz reservas por telefone. Funciona 24 horas, inclusive feriados.',
  },
  {
    icon: Shield,
    title: 'Depósito antecipado',
    description: 'Cobranças via Stripe no momento da reserva, com devolução automática após a visita. Reduz no-shows em até 40%.',
  },
  {
    icon: Zap,
    title: 'Dashboard em tempo real',
    description: 'Painel completo com ocupação, receita prevista, alertas proativos e relatórios semanais. Tudo no navegador ou tablet.',
  },
];

export default function SeoSolution({ page }: SeoSolutionProps) {
  return (
    <section className="py-16 bg-warm-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <h2 className="font-serif text-2xl sm:text-3xl font-bold text-deep-charcoal mb-3 text-center">
          Como o Seatable resolve isso para {page.cuisine.toLowerCase()}
        </h2>
        <p className="text-warm-stone text-center mb-12 max-w-2xl mx-auto">
          Tecnologia feita para restaurantes brasileiros. Sem complicação,
          sem contratos longos, sem surpresas.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {SOLUTIONS.map((sol) => {
            const Icon = sol.icon;
            return (
              <div
                key={sol.title}
                className="border border-border-gray rounded-2xl p-6 bg-white"
              >
                <div className="w-10 h-10 rounded-xl bg-burgundy/10 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-burgundy" />
                </div>
                <h3 className="text-base font-semibold text-deep-charcoal mb-2">
                  {sol.title}
                </h3>
                <p className="text-sm text-warm-stone leading-relaxed">
                  {sol.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
