/**
 * SeoFaq â€” cuisine-specific FAQ section with accordion.
 * FAQ content comes from the data layer for uniqueness per page.
 */

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { SeoPageData } from '../../data/seoPages';

interface SeoFaqProps {
  readonly page: SeoPageData;
}

function FaqItem({ question, answer }: { readonly question: string; readonly answer: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-glass-border-dark last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full py-5 text-left"
        aria-expanded={open}
      >
        <span className="text-base font-medium text-deep-charcoal pr-4">
          {question}
        </span>
        <ChevronDown
          className={`w-5 h-5 text-warm-stone flex-shrink-0 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-200 ${
          open ? 'max-h-60 pb-5' : 'max-h-0'
        }`}
      >
        <p className="text-sm text-warm-stone leading-relaxed">{answer}</p>
      </div>
    </div>
  );
}

export default function SeoFaq({ page }: SeoFaqProps) {
  return (
    <section className="py-16 bg-warm-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <h2 className="font-serif text-2xl sm:text-3xl font-bold text-deep-charcoal mb-3 text-center">
          Perguntas frequentes sobre reservas para {page.cuisine.toLowerCase()}
        </h2>
        <p className="text-warm-stone text-center mb-10">
          D&uacute;vidas comuns de donos de {page.cuisine.toLowerCase()} em{' '}
          {page.city} sobre o Seatable.
        </p>

        <div className="border border-glass-border-dark rounded-2xl bg-white p-6">
          {page.faqs.map((faq) => (
            <FaqItem
              key={faq.question}
              question={faq.question}
              answer={faq.answer}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
