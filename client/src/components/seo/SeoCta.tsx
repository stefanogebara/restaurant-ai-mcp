/**
 * SeoCta — final call-to-action section with "Teste gratis por 3 meses".
 */

import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { SeoPageData } from '../../data/seoPages';

interface SeoCtaProps {
  readonly page: SeoPageData;
}

export default function SeoCta({ page }: SeoCtaProps) {
  return (
    <section className="py-16 bg-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="bg-deep-charcoal rounded-2xl p-8 sm:p-12 text-center">
          <h2 className="font-serif text-2xl sm:text-3xl text-white mb-4">
            Pronto para transformar as reservas{' '}
            <span className="text-burgundy">
              {page.cuisine.includes('Restaurante') ? 'do seu restaurante' : `da sua ${page.cuisine.toLowerCase().replace(/^restaurantes?\s*(de\s*)?/i, '')}`}
            </span>
            ?
          </h2>
          <p className="text-stone-400 mb-8 max-w-xl mx-auto">
            Comece hoje sem compromisso. Configure em 15 minutos, sem
            cart&atilde;o de cr&eacute;dito. Veja o resultado na primeira semana.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/demo/setup"
              className="inline-flex items-center gap-2 px-8 py-4 bg-burgundy hover:bg-burgundy-dark text-white font-semibold rounded-xl transition-colors"
            >
              Teste gr&aacute;tis por 3 meses
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="https://wa.me/5511950289356?text=Ol%C3%A1%2C%20tenho%20uma%20${encodeURIComponent(page.cuisine.toLowerCase())}%20e%20quero%20saber%20mais"
              target="_blank"
              rel="noopener noreferrer"
              className="text-stone-400 hover:text-white transition-colors text-sm underline underline-offset-4"
            >
              Ou fale com um especialista no WhatsApp
            </a>
          </div>

          <p className="mt-6 text-xs text-stone-500">
            Sem cart&atilde;o de cr&eacute;dito &bull; Cancele quando quiser
            &bull; Suporte em portugu&ecirc;s
          </p>
        </div>
      </div>
    </section>
  );
}
