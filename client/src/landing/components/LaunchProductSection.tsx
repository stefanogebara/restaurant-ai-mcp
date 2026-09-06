import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import LiveServiceCanvas from './LiveServiceCanvas';

export default function LaunchProductSection() {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();

  return (
    <>
      <section className="bg-[#FAFAF9] px-5 py-24 text-[#0B0B0C] sm:px-10 sm:py-32 lg:px-16 lg:py-40">
        <div className="mx-auto max-w-[1040px] text-center">
          <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[#706A65]">{t('landing.launch.introEyebrow', 'Built around service')}</p>
          <h2 className="mx-auto mt-6 max-w-[980px] text-balance text-[clamp(2.8rem,6vw,5.75rem)] font-semibold leading-[0.98] tracking-[-0.05em]">
            {t('landing.launch.introTitle', 'The best service looks effortless. The work behind it is not.')}
          </h2>
          <p className="mx-auto mt-7 max-w-[650px] text-pretty text-[18px] leading-[1.5] text-[#706A65] sm:text-[21px]">
            {t('landing.launch.introBody', 'Seatable keeps the invisible work moving, so hosts can notice the guest in front of them.')}
          </p>
        </div>
      </section>

      <section id="experience" className="overflow-hidden bg-[#F2F1EF] px-3 py-20 text-[#0B0B0C] sm:px-8 sm:py-28 lg:px-12 lg:py-36">
        <div className="mx-auto max-w-[1200px]">
          <div className="mx-auto mb-12 max-w-[820px] text-center sm:mb-16">
            <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[#706A65]">{t('landing.launch.productEyebrow', 'Tonight, already under control')}</p>
            <h2 className="mt-5 text-balance text-[clamp(2.5rem,5.2vw,5.1rem)] font-semibold leading-[0.98] tracking-[-0.047em]">
              {t('landing.launch.productTitle', 'One live view of the whole room.')}
            </h2>
            <p className="mx-auto mt-6 max-w-[620px] text-pretty text-[17px] leading-[1.5] text-[#706A65] sm:text-[20px]">
              {t('landing.launch.productBody', 'Demand, tables, guest context, timing, and revenue stay together from the first message to the final turn.')}
            </p>
          </div>

          <motion.div initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.99 }} whileInView={{ opacity: 1, y: 0, scale: 1 }} viewport={{ once: true, amount: 0.18 }} transition={{ duration: reduceMotion ? 0 : 0.7, ease: [0.2, 0.8, 0.2, 1] }}>
            <LiveServiceCanvas />
          </motion.div>

          <div className="mt-12 grid border-y border-black/[0.12] sm:grid-cols-3 sm:divide-x sm:divide-black/[0.12]">
            <div className="py-7 text-center sm:px-6"><p className="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">24/7</p><p className="mt-2 text-sm text-[#706A65]">{t('landing.editorial.metric1', 'Every guest gets an answer')}</p></div>
            <div className="border-t border-black/[0.12] py-7 text-center sm:border-t-0 sm:px-6"><p className="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">3 → 1</p><p className="mt-2 text-sm text-[#706A65]">{t('landing.editorial.metric2', 'Three channels, one service')}</p></div>
            <div className="border-t border-black/[0.12] py-7 text-center sm:border-t-0 sm:px-6"><p className="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">14</p><p className="mt-2 text-sm text-[#706A65]">{t('landing.editorial.metric3', 'Days to try it free')}</p></div>
          </div>
        </div>
      </section>
    </>
  );
}
