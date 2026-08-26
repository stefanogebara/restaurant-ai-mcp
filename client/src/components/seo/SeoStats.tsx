/**
 * SeoStats — cuisine-specific statistics and social proof.
 * Shows no-show rate, avg ticket, peak hours, and weekly reservations.
 */

import { TrendingDown, Receipt, Clock, Calendar } from 'lucide-react';
import type { SeoPageData } from '../../data/seoPages';

interface SeoStatsProps {
  readonly page: SeoPageData;
}

export default function SeoStats({ page }: SeoStatsProps) {
  const stats = [
    {
      icon: TrendingDown,
      label: 'Taxa de no-show',
      value: page.stats.noShowRate,
      note: 'Reduza em ate 40% com Seatable',
    },
    {
      icon: Receipt,
      label: 'Ticket medio',
      value: page.stats.avgTicket,
      note: `Para ${page.cuisine.toLowerCase()} em ${page.city}`,
    },
    {
      icon: Clock,
      label: 'Horarios de pico',
      value: page.stats.peakHours,
      note: 'Quando voce mais precisa de automação',
    },
    {
      icon: Calendar,
      label: 'Reservas por semana',
      value: page.stats.weeklyReservations,
      note: 'Volume medio do segmento',
    },
  ];

  return (
    <section className="py-16 bg-deep-charcoal">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <h2 className="font-serif text-2xl sm:text-3xl text-white mb-3 text-center">
          N&uacute;meros que importam para {page.cuisine.toLowerCase()}
        </h2>
        <p className="text-stone-400 text-center mb-12 max-w-2xl mx-auto">
          Dados do mercado de {page.cuisine.toLowerCase()} em {page.city}.
          O Seatable ajuda voc&ecirc; a melhorar cada um deles.
        </p>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.label}
                className="border border-stone-700 rounded-2xl p-5 bg-charcoal-dark"
              >
                <Icon className="w-5 h-5 text-burgundy mb-3" />
                <p className="text-2xl sm:text-3xl font-bold text-white mb-1">
                  {stat.value}
                </p>
                <p className="text-sm font-medium text-stone-300 mb-1">
                  {stat.label}
                </p>
                <p className="text-xs text-stone-500">{stat.note}</p>
              </div>
            );
          })}
        </div>

        {/* Social proof */}
        <div className="mt-12 text-center">
          <p className="text-stone-400 text-sm mb-4">
            Mais de <span className="text-white font-semibold">100 restaurantes</span>{' '}
            j&aacute; usam o Seatable no Brasil
          </p>
          <div className="flex items-center justify-center gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <svg
                key={star}
                className="w-5 h-5 text-amber-400"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            ))}
            <span className="ml-2 text-white text-sm font-medium">4.8/5</span>
          </div>
        </div>
      </div>
    </section>
  );
}
