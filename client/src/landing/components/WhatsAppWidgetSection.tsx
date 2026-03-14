import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { trackWhatsAppTapped } from '../../lib/analytics';

const WA_URL = 'https://wa.me/551150289356?text=Hi!%20I\'d%20like%20to%20book%20a%20table%20for%204%20tomorrow%20at%208pm';
const MESSAGE_TEXT = "Hi! I'd like to book a table for 4 tomorrow at 8pm";

export default function WhatsAppWidgetSection() {
  const { t } = useTranslation();

  return (
    <section className="py-24 px-6 bg-soft-gray border-t border-border-gray">
      <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
        {/* Left — Phone mockup */}
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="flex justify-center"
        >
          <motion.a
            href={WA_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-[280px] sm:w-[320px] select-none"
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            whileHover={{ scale: 1.02, boxShadow: '0 0 40px rgba(37,211,102,0.2)' }}
          >
            <div className="bg-deep-charcoal rounded-[2.5rem] p-2.5 shadow-2xl" aria-hidden="true">
              <div className="bg-soft-gray rounded-[2rem] overflow-hidden flex flex-col">
                {/* Notch */}
                <div className="flex justify-center pt-2 pb-1 bg-[#075E54]">
                  <div className="w-24 h-5 bg-deep-charcoal rounded-full" />
                </div>
                {/* Header */}
                <div className="bg-[#075E54] px-4 pb-3 pt-1 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-whatsapp/30 flex items-center justify-center">
                    <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="currentColor">
                      <path d="M12 2a9 9 0 0 0-6.95 14.68l-.95 3.32 3.42-.9A9 9 0 1 0 12 2Zm0 16.5a7.5 7.5 0 1 1 3.58-.91l-.25.15-2.48.65.66-2.42-.16-.27A7.46 7.46 0 0 1 12 18.5Z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-white text-sm font-semibold">Seatable AI</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="w-2 h-2 rounded-full bg-whatsapp" />
                      <span className="text-white/70 text-[11px]">online</span>
                    </div>
                  </div>
                </div>
                {/* Chat */}
                <div className="px-3 py-4 min-h-[200px]" style={{ backgroundImage: 'radial-gradient(circle at 20% 80%, #e8e5e0 0%, #ede9e3 100%)' }}>
                  <div className="flex justify-end">
                    <div className="max-w-[85%] px-3 py-2 bg-green-100 rounded-2xl rounded-tr-sm text-[13px] text-deep-charcoal shadow-sm">
                      {MESSAGE_TEXT}
                    </div>
                  </div>
                </div>
                {/* Input bar with Send */}
                <div className="bg-soft-gray px-3 py-2 flex items-center gap-2 border-t border-border-gray">
                  <div className="flex-1 bg-white rounded-full px-4 py-2 text-[12px] text-muted-stone truncate">
                    {MESSAGE_TEXT}
                  </div>
                  <div className="w-8 h-8 rounded-full bg-whatsapp flex items-center justify-center flex-shrink-0">
                    <svg viewBox="0 0 24 24" className="w-4 h-4 text-white" fill="currentColor">
                      <path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </motion.a>
        </motion.div>

        {/* Right — Copy */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <div className="text-xs font-semibold tracking-[2px] uppercase text-whatsapp mb-4">
            {t('landing.whatsapp.label', 'Real AI, real WhatsApp')}
          </div>
          <h2 className="font-serif text-[40px] font-medium tracking-tight text-deep-charcoal leading-tight mb-4">
            {t('landing.whatsapp.heading', 'Text our AI right now')}
          </h2>
          <p className="text-lg text-warm-stone font-light leading-relaxed mb-8">
            {t('landing.whatsapp.subtitle', 'Send a message on WhatsApp and get an instant response from our AI. No app to download, no signup needed.')}
          </p>
          <a
            href={WA_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackWhatsAppTapped()}
            className="inline-flex items-center gap-2 px-8 py-3.5 bg-whatsapp hover:bg-whatsapp/90 text-white text-[15px] font-semibold rounded-full transition-colors mb-6"
          >
            {t('landing.whatsapp.cta', 'Send a test message')} &rarr;
          </a>
          <p className="text-xs text-muted-stone">
            {t('landing.whatsapp.trust', 'Real number: +55 11 5028-9356 · São Paulo, Brazil')}
          </p>
        </motion.div>
      </div>
    </section>
  );
}
