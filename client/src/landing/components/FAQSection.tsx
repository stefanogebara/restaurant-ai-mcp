import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { FAQS } from '../data/demoData';

export default function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

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
    <section id="faq" className="py-24 px-6 sm:px-16 bg-[#FAFAF9]">
      <div className="max-w-[700px] mx-auto">
        {/* Header */}
        <div className="text-center mb-14">
          <div className="text-xs font-semibold tracking-[2px] uppercase text-[#9F1239] mb-4">FAQ</div>
          <h2 className="font-serif text-4xl sm:text-[48px] font-medium tracking-tight text-[#1C1917] mb-3">
            Frequently asked questions
          </h2>
          <p className="text-[17px] text-[#78716C] font-light">Everything you need to know about Seatable</p>
        </div>

        {/* Accordion */}
        <div className="space-y-3">
          {FAQS.map((faq, index) => (
            <div key={index} className="bg-white rounded-2xl border border-[#E7E5E4] overflow-hidden">
              <button
                onClick={() => toggleFAQ(index)}
                aria-expanded={openIndex === index}
                className="w-full px-6 py-5 flex items-center justify-between text-left hover:bg-[#FAFAF9] transition-colors"
              >
                <span className="text-[15px] font-medium text-[#1C1917] pr-8">{faq.question}</span>
                <ChevronDown
                  className={`w-5 h-5 text-[#9F1239] flex-shrink-0 transition-transform duration-200 ${
                    openIndex === index ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {openIndex === index && (
                <div className="px-6 pb-5 text-sm text-[#78716C] font-light leading-relaxed border-t border-[#E7E5E4] pt-4">
                  {faq.answer}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* CTA Card */}
        <div className="bg-[#1C1917] rounded-3xl p-10 sm:p-14 text-center mt-16">
          <h3 className="font-serif text-2xl sm:text-3xl font-medium text-white mb-3 tracking-tight">Still have questions?</h3>
          <p className="text-[15px] text-[#A8A29E] font-light mb-8">
            We&apos;re here to help. Reach out to our team anytime.
          </p>
          <button
            onClick={scrollToContact}
            className="px-8 py-3.5 bg-[#9F1239] hover:bg-[#881337] text-white text-[15px] font-semibold rounded-full transition-colors"
          >
            Contact Support
          </button>
        </div>
      </div>
    </section>
  );
}
