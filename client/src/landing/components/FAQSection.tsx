import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { FAQS } from '../data/demoData';

export default function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="faq" className="relative py-24 bg-cream-100 overflow-hidden">
      {/* Background pattern */}
      <div className="absolute inset-0 bg-parchment-texture opacity-20" />

      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="font-display text-4xl md:text-5xl font-bold text-burgundy-900 mb-4">
            <span className="text-gold-600">Frequently Asked</span> Questions
          </h2>
          <p className="font-sans text-xl text-charcoal-600">
            Everything you need to know about RestaurantAI
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
              className="bg-cream-50 border-2 border-cream-300 rounded-2xl overflow-hidden hover:border-burgundy-300 transition-colors"
            >
              <button
                onClick={() => toggleFAQ(index)}
                className="w-full px-6 py-5 flex items-center justify-between text-left hover:bg-cream-100 transition-colors"
              >
                <span className="font-display text-lg font-semibold text-burgundy-900 pr-8">{faq.question}</span>
                <motion.div
                  animate={{ rotate: openIndex === index ? 180 : 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <ChevronDown className="w-6 h-6 text-burgundy-700 flex-shrink-0" />
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
                    <div className="px-6 pb-5 font-sans text-charcoal-700 leading-relaxed border-t border-burgundy-200 pt-4">
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
          className="text-center mt-12"
        >
          <div className="bg-cream-50 border-2 border-gold-300 p-8 rounded-2xl inline-block">
            <h3 className="font-display text-xl font-bold text-burgundy-900 mb-2">Still have questions?</h3>
            <p className="font-sans text-charcoal-600 mb-4">
              We're here to help. Reach out to our team anytime.
            </p>
            <button
              onClick={() => {
                const element = document.getElementById('contact');
                if (element) element.scrollIntoView({ behavior: 'smooth' });
              }}
              className="px-6 py-3 font-sans font-semibold bg-gradient-to-r from-burgundy-700 to-burgundy-800 text-cream-50 rounded-xl shadow-burgundy hover:-translate-y-1 transition-all duration-200"
            >
              Contact Support
            </button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
