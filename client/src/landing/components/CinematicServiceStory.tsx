import { useEffect, useRef } from 'react';
import { motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import { useTranslation } from 'react-i18next';

const STEPS = [
  { number: '01', title: 'landing.editorial.moment1Title', fallbackTitle: 'A guest reaches out', body: 'landing.editorial.moment1Body', fallbackBody: 'WhatsApp, voice, web, or a walk-in. Every conversation begins in the same shared context.' },
  { number: '02', title: 'landing.editorial.moment3Title', fallbackTitle: 'The floor moves with it', body: 'landing.editorial.moment3Body', fallbackBody: 'Hosts see the reservation, table, risk, and predicted spend without copying a thing.' },
  { number: '03', title: 'landing.editorial.moment4Title', fallbackTitle: 'The manager sees ahead', body: 'landing.editorial.moment4Body', fallbackBody: 'Briefings, staffing, revenue, and retention signals arrive before they become problems.' },
];

function StoryBeat({ index }: { index: number }) {
  const { t } = useTranslation();
  const step = STEPS[index];
  return (
    <div className="max-w-[540px]">
      <p className="text-[12px] font-semibold tracking-[0.1em] text-white/[0.55]">{step.number} / 03</p>
      <h3 className="mt-5 text-balance text-[clamp(2.7rem,5.2vw,5.4rem)] font-semibold leading-[0.96] tracking-[-0.05em] text-white">{t(step.title, step.fallbackTitle)}</h3>
      <p className="mt-6 max-w-[480px] text-pretty text-[17px] leading-[1.5] text-white/[0.68] sm:text-[20px]">{t(step.body, step.fallbackBody)}</p>
    </div>
  );
}

export default function CinematicServiceStory() {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const scrollYProgress = useMotionValue(0);

  useEffect(() => {
    if (reduceMotion) return;

    const updateProgress = () => {
      const section = sectionRef.current;
      if (!section) return;
      const start = section.offsetTop;
      const distance = Math.max(section.offsetHeight - window.innerHeight, 1);
      const progress = Math.min(1, Math.max(0, (window.scrollY - start) / distance));
      scrollYProgress.set(progress);
    };

    updateProgress();
    window.addEventListener('scroll', updateProgress, { passive: true });
    window.addEventListener('resize', updateProgress);
    return () => {
      window.removeEventListener('scroll', updateProgress);
      window.removeEventListener('resize', updateProgress);
    };
  }, [reduceMotion, scrollYProgress]);
  const imageScale = useTransform(scrollYProgress, [0, 1], [1.03, 1]);
  const opacity0 = useTransform(scrollYProgress, [0, 0.27, 0.36], [1, 1, 0]);
  const opacity1 = useTransform(scrollYProgress, [0.27, 0.38, 0.61, 0.72], [0, 1, 1, 0]);
  const opacity2 = useTransform(scrollYProgress, [0.63, 0.74, 1], [0, 1, 1]);
  const y0 = useTransform(scrollYProgress, [0, 0.36], [0, -18]);
  const y1 = useTransform(scrollYProgress, [0.27, 0.38, 0.72], [18, 0, -18]);
  const y2 = useTransform(scrollYProgress, [0.63, 0.74], [18, 0]);
  const progress0 = useTransform(scrollYProgress, [0, 0.33], [0, 1]);
  const progress1 = useTransform(scrollYProgress, [0.33, 0.66], [0, 1]);
  const progress2 = useTransform(scrollYProgress, [0.66, 1], [0, 1]);
  const progressBars = [progress0, progress1, progress2];

  return (
    <section id="story" ref={sectionRef} className="relative bg-[#0B0B0C] text-white lg:h-[300svh]">
      <div className="relative hidden h-[100svh] min-h-[720px] overflow-hidden lg:sticky lg:top-0 lg:block">
        <motion.img src="/images/landing/service-in-motion.webp" alt="" className="absolute inset-0 h-full w-full object-cover" width="1672" height="941" style={reduceMotion ? undefined : { scale: imageScale }} />
        <div className="landing-story-shade absolute inset-0" aria-hidden="true" />
        <div className="relative mx-auto flex h-full max-w-[1200px] items-center justify-end px-16">
          <p className="absolute left-16 top-24 text-[12px] font-semibold uppercase tracking-[0.1em] text-white/[0.58]">{t('landing.launch.storyEyebrow', 'From arrival to last table')}</p>
          <div className="absolute right-16 top-1/2 w-[calc(50%-64px)] -translate-y-1/2"><motion.div style={{ opacity: opacity0, y: reduceMotion ? 0 : y0 }}><StoryBeat index={0} /></motion.div></div>
          <div className="absolute right-16 top-1/2 w-[calc(50%-64px)] -translate-y-1/2"><motion.div style={{ opacity: opacity1, y: reduceMotion ? 0 : y1 }}><StoryBeat index={1} /></motion.div></div>
          <div className="absolute right-16 top-1/2 w-[calc(50%-64px)] -translate-y-1/2"><motion.div style={{ opacity: opacity2, y: reduceMotion ? 0 : y2 }}><StoryBeat index={2} /></motion.div></div>
          <div className="absolute bottom-12 right-16 flex gap-2" aria-hidden="true">
            {STEPS.map((step, index) => <span key={step.number} className="relative h-1 w-12 overflow-hidden rounded-full bg-white/25"><motion.span className="absolute inset-0 origin-left rounded-full bg-white" style={{ scaleX: reduceMotion ? 1 : progressBars[index] }} /></span>)}
          </div>
        </div>
      </div>

      <div className="lg:hidden">
        <div className="relative aspect-[4/5] min-h-[520px] overflow-hidden">
          <img src="/images/landing/service-in-motion.webp" alt="" className="h-full w-full object-cover object-[42%_center]" width="1672" height="941" loading="lazy" />
          <div className="absolute inset-0 bg-black/[0.35]" aria-hidden="true" />
          <p className="absolute left-5 top-24 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/70 sm:left-10">{t('landing.launch.storyEyebrow', 'From arrival to last table')}</p>
        </div>
        <div className="px-5 sm:px-10">
          {STEPS.map((step, index) => <div key={step.number} className="border-b border-white/[0.14] py-16 last:border-b-0"><StoryBeat index={index} /></div>)}
        </div>
      </div>
    </section>
  );
}
