import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { FAQS } from '../data/demoData';

export default function FAQSection() {
  const { t } = useTranslation();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  const scrollToContact = () => {
    const element = document.getElementById('contact');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section id="faq" className="py-24 px-6 sm:px-16 bg-warm-white">
      <div className="max-w-[700px] mx-auto">
        {/* Header */}
        <div className="text-center mb-14">
          <div className="text-xs font-semibold tracking-[2px] uppercase text-burgundy mb-4">{t('landing.faq.label')}</div>
          <h2 className="font-serif text-4xl sm:text-[48px] font-medium tracking-tight text-deep-charcoal mb-3">
            {t('landing.faq.heading')}
          </h2>
          <p className="text-[17px] text-warm-stone font-light">{t('landing.faq.subheading')}</p>
        </div>

        {/* Accordion */}
        <div className="space-y-3">
          {FAQS.map((faq, index) => (
            <div key={index} className="bg-white rounded-2xl border border-border-gray overflow-hidden">
              <button
                type="button"
                onClick={() => toggleFAQ(index)}
                aria-expanded={openIndex === index}
                className="w-full px-6 py-5 flex items-center justify-between text-left hover:bg-warm-white transition-colors"
              >
                <span className="text-[15px] font-medium text-deep-charcoal pr-8">
                  {t(`landing.faq.q${index + 1}`, faq.question)}
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className={`w-5 h-5 text-burgundy flex-shrink-0 transition-transform duration-200 ${
                    openIndex === index ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {openIndex === index && (
                <div className="px-6 pb-5 text-sm text-warm-stone font-light leading-relaxed border-t border-border-gray pt-4">
                  {t(`landing.faq.a${index + 1}`, faq.answer)}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* CTA Card */}
        <div className="bg-deep-charcoal rounded-3xl p-10 sm:p-14 text-center mt-16">
          <h3 className="font-serif text-2xl sm:text-3xl font-medium text-white mb-3 tracking-tight">{t('landing.faq.cta')}</h3>
          <p className="text-[15px] text-muted-stone font-light mb-8">
            {t('landing.faq.ctaSubtext')}
          </p>
          <button
            type="button"
            onClick={scrollToContact}
            className="px-8 py-3.5 bg-burgundy hover:bg-burgundy-dark text-white text-[15px] font-semibold rounded-full transition-colors"
          >
            {t('landing.faq.ctaButton')}
          </button>
        </div>
      </div>
    </section>
  );
}
