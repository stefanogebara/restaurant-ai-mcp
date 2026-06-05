/**
 * SeoPainPoints â€” displays cuisine-specific pain points
 * that the target audience will recognize.
 */

import { AlertTriangle, Clock, TrendingDown } from 'lucide-react';
import type { SeoPageData } from '../../data/seoPages';

interface SeoPainPointsProps {
  readonly page: SeoPageData;
}

const ICONS = [AlertTriangle, Clock, TrendingDown];

export default function SeoPainPoints({ page }: SeoPainPointsProps) {
  return (
    <section className="py-16 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <h2 className="font-serif text-2xl sm:text-3xl font-bold text-deep-charcoal mb-3 text-center">
          Os desafios que {page.cuisine.toLowerCase()} em {page.city} enfrentam
        </h2>
        <p className="text-warm-stone text-center mb-12 max-w-2xl mx-auto">
          Se voc&ecirc; gerencia um restaurante do tipo {page.cuisine.toLowerCase()},
          provavelmente j&aacute; enfrentou esses problemas.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {page.painPoints.map((point, i) => {
            const Icon = ICONS[i % ICONS.length];
            return (
              <div
                key={point.title}
                className="border border-glass-border-dark rounded-2xl p-6 bg-warm-white"
              >
                <div className="w-10 h-10 rounded-xl bg-burgundy/10 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-burgundy" />
                </div>
                <h3 className="text-base font-semibold text-deep-charcoal mb-2">
                  {point.title}
                </h3>
                <p className="text-sm text-warm-stone leading-relaxed">
                  {point.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
