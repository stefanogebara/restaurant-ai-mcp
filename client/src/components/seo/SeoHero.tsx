/**
 * SeoHero — hero section for programmatic SEO pages.
 * Headline, subheading, and CTA targeting cuisine+city.
 */

import { Link } from 'react-router-dom';
import { ArrowRight, Phone } from 'lucide-react';
import type { SeoPageData } from '../../data/seoPages';

interface SeoHeroProps {
  readonly page: SeoPageData;
}

export default function SeoHero({ page }: SeoHeroProps) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-warm-white via-soft-gray to-warm-white">
      {/* Subtle decorative gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(159,18,57,0.06),_transparent_60%)]" />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <div className="max-w-3xl">
          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" className="mb-6">
            <ol className="flex items-center gap-2 text-sm text-warm-stone">
              <li>
                <Link to="/" className="hover:text-burgundy transition-colors">
                  Seatable
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li>
                <span className="text-deep-charcoal font-medium">
                  {page.cuisine} em {page.city}
                </span>
              </li>
            </ol>
          </nav>

          <h1 className="font-serif text-3xl sm:text-4xl lg:text-[48px] font-bold text-deep-charcoal leading-tight mb-6">
            O melhor sistema de reservas para{' '}
            <span className="text-burgundy">{page.cuisine}</span> em{' '}
            {page.city}
          </h1>

          <p className="text-lg text-warm-stone leading-relaxed mb-8 max-w-2xl">
            Reduza no-shows, gerencie walk-ins e automatize reservas via
            WhatsApp com intelig&ecirc;ncia artificial. Feito para{' '}
            {page.cuisine.toLowerCase()} que querem crescer sem aumentar
            a equipe.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              to="/demo/setup"
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-burgundy hover:bg-burgundy-dark text-white font-semibold rounded-xl transition-colors text-sm"
            >
              {page.ctaText}
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="https://wa.me/5511950289356?text=Ol%C3%A1%2C%20quero%20saber%20mais%20sobre%20o%20Seatable"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 border border-border-gray bg-white hover:border-burgundy text-deep-charcoal font-semibold rounded-xl transition-colors text-sm"
            >
              <Phone className="w-4 h-4" />
              Falar no WhatsApp
            </a>
          </div>

          {/* Trust badges */}
          <div className="mt-10 flex flex-wrap items-center gap-6 text-sm text-warm-stone">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              Setup em 15 minutos
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              Sem contrato de fidelidade
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              Suporte em portugu&ecirc;s
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
