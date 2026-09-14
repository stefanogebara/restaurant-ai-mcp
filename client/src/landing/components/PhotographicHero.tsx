import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../../components/common/ThiingsIcon';
import { trackCtaClicked, trackHeadlineVariantViewed } from '../../lib/analytics';

export default function PhotographicHero() {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    trackHeadlineVariantViewed({ variant: 'service_orchestrated' });
  }, []);

  return (
    <section className="launch-hero relative min-h-[100svh] overflow-hidden bg-[#0B0B0C] text-white" data-headline-variant="service_orchestrated">
      <motion.div
        className="absolute inset-0"
        initial={reduceMotion ? false : { opacity: 0, scale: 1.025 }}
        animate={ready ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 1.025 }}
        transition={{ duration: reduceMotion ? 0 : 0.9, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <picture>
          <source media="(max-width: 639px)" srcSet="/images/landing/hero-service-mobile.webp" />
          <img src="/images/landing/hero-service-desktop.webp" alt="" className="h-full w-full object-cover object-[62%_center] sm:object-center" width="1586" height="992" fetchPriority="high" onLoad={() => setReady(true)} />
        </picture>
      </motion.div>
      <div className="landing-hero-shade absolute inset-0" aria-hidden="true" />

      <div className="launch-hero-content relative mx-auto flex min-h-[100svh] max-w-[1200px] flex-col justify-end px-5 pb-10 pt-28 sm:px-10 sm:pb-14 lg:px-16 lg:pb-16">
        <motion.div className="launch-hero-copy" initial={reduceMotion ? false : { opacity: 0, y: 20 }} animate={ready ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }} transition={{ duration: reduceMotion ? 0 : 0.7, delay: reduceMotion ? 0 : 0.18, ease: [0.2, 0.8, 0.2, 1] }}>
          <p className="mb-5 text-[12px] font-semibold uppercase tracking-[0.11em] text-white/[0.72]">{t('landing.launch.heroEyebrow', 'The operating system for service')}</p>
          <h1 className="launch-hero-title max-w-[980px] text-balance text-[clamp(3.45rem,8.2vw,7.5rem)] font-semibold leading-[0.91] tracking-[-0.055em] text-white">
            {t('landing.launch.heroTitle', 'Service, orchestrated.')}
          </h1>
          <div className="launch-hero-body mt-6 max-w-[720px] sm:mt-8">
            <p className="max-w-[620px] text-pretty text-[18px] leading-[1.45] text-white/[0.78] sm:text-[21px]">
              {t('landing.launch.heroBody', 'Every call, message, reservation, and table working as one — while your team stays with the room.')}
            </p>
            <div className="launch-hero-actions mt-7 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <Link to="/demo/setup" onClick={() => trackCtaClicked({ cta: 'primary', location: 'launch_hero' })} className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full bg-burgundy px-7 text-[15px] font-semibold text-white transition-[transform,background-color] duration-200 hover:-translate-y-px hover:bg-burgundy-dark">
                {t('landing.launch.heroCta', 'See it with your restaurant')}<ThiingsIcon name="arrow-right" pxSize={15} />
              </Link>
              <button type="button" onClick={() => document.getElementById('experience')?.scrollIntoView({ behavior: 'smooth' })} className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full border border-white/[0.28] bg-black/10 px-6 text-[15px] font-semibold text-white backdrop-blur-sm transition-colors duration-200 hover:bg-white/10">
                {t('landing.launch.heroSecondary', 'See the product')}<ThiingsIcon name="arrow-down" pxSize={14} />
              </button>
            </div>
            <p className="launch-hero-trust mt-4 text-[12px] text-white/[0.58]">{t('landing.launch.heroTrust', '14 days free · no credit card · ready in minutes')}</p>
          </div>
        </motion.div>

        <div className="absolute bottom-8 right-5 hidden items-center gap-2 text-[11px] font-medium uppercase tracking-[0.1em] text-white/[0.55] lg:flex">
          <span>{t('landing.launch.scroll', 'Scroll to enter service')}</span><span className="h-px w-12 bg-white/[0.35]" />
        </div>
      </div>
    </section>
  );
}
