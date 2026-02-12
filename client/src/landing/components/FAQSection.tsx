import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ThiingsIcon from '../../components/common/ThiingsIcon';
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
    <section id="faq" className="py-24 px-6 bg-white">
      <div className="max-w-3xl mx-auto">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="font-serif text-3xl md:text-4xl italic mb-4 text-[#1C1917]">
            Frequently Asked Questions
          </h2>
          <div className="w-16 h-0.5 bg-[#9F1239] mx-auto opacity-50 mb-6"></div>
          <p className="text-lg text-[#57534E] font-light">
            Everything you need to know about Seatable
          </p>
        </motion.div>

        {/* FAQ Accordion */}
        <div className="space-y-4">
          {FAQS.map((faq, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="bg-[#FAFAF9] rounded-2xl border border-[#E7E5E4] overflow-hidden"
            >
              <button
                onClick={() => toggleFAQ(index)}
                className="w-full px-6 py-5 flex items-center justify-between text-left hover:bg-[#F5F5F4] transition-colors"
              >
                <span className="text-lg font-serif text-[#1C1917] pr-8">{faq.question}</span>
                <motion.div
                  animate={{ rotate: openIndex === index ? 180 : 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex-shrink-0"
                >
                  <ThiingsIcon name="chevron-down" pxSize={20} />
                </motion.div>
              </button>

              <AnimatePresence>
                {openIndex === index && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className="px-6 pb-5 text-[#57534E] leading-relaxed border-t border-[#E7E5E4] pt-4 font-light">
                      {faq.answer}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>

        {/* Still have questions? */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="text-center mt-16"
        >
          <div className="bg-[#1C1917] p-10 rounded-[2rem]">
            <h3 className="font-serif text-2xl text-white mb-3">Still have questions?</h3>
            <p className="text-gray-400 mb-6 font-light">
              We're here to help. Reach out to our team anytime.
            </p>
            <button
              onClick={scrollToContact}
              className="bg-[#9F1239] text-white px-8 py-4 text-sm tracking-widest uppercase font-bold hover:bg-[#881337] transition-all duration-300 rounded-2xl inline-flex items-center gap-2"
            >
              Contact Support
              <ThiingsIcon name="arrow-right" pxSize={16} />
            </button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
