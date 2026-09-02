import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import ThiingsIcon, { type IconName } from '../../components/common/ThiingsIcon';

const MOMENTS: Array<{ number: string; icon: IconName; title: string; body: string }> = [
  { number: '01', icon: 'chat', title: 'landing.editorial.moment1Title', body: 'landing.editorial.moment1Body' },
  { number: '02', icon: 'calendar-check', title: 'landing.editorial.moment2Title', body: 'landing.editorial.moment2Body' },
  { number: '03', icon: 'layout-grid', title: 'landing.editorial.moment3Title', body: 'landing.editorial.moment3Body' },
  { number: '04', icon: 'brain', title: 'landing.editorial.moment4Title', body: 'landing.editorial.moment4Body' },
];

const MOMENT_FALLBACKS = [
  ['A guest reaches out', 'WhatsApp, voice, web, or a walk-in. Every conversation begins in the same shared context.'],
  ['The right table is found', 'Availability, guest history, deposits, and restaurant policy are checked in seconds.'],
  ['The floor moves with it', 'Hosts see the reservation, table, risk, and predicted spend without copying a thing.'],
  ['The manager sees ahead', 'Briefings, staffing, revenue, and retention signals arrive before they become problems.'],
];

function ServiceMap() {
  const { t } = useTranslation();
  return (
    <div className="relative overflow-hidden rounded-[30px] bg-deep-charcoal p-5 text-white sm:p-7">
      <div className="flex items-center justify-between border-b border-white/10 pb-5">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-white/45">{t('landing.editorial.mapLabel', 'Live floor')}</p>
          <p className="mt-1 text-lg">{t('landing.editorial.mapTitle', 'Friday · 20:14')}</p>
        </div>
        <span className="rounded-full bg-white/10 px-3 py-2 text-[11px] text-white/70">{t('landing.editorial.mapSync', 'All channels synced')}</span>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-4">
        {[2, 4, 2, 6, 4, 2, 4, 8].map((seats, index) => {
          const active = [1, 2, 4, 6].includes(index);
          const reserved = [3, 5].includes(index);
          return (
            <div key={`${seats}-${index}`} className={`relative aspect-square rounded-[18px] border p-3 ${active ? 'border-emerald-400/25 bg-emerald-400/10' : reserved ? 'border-amber-400/25 bg-amber-400/10' : 'border-white/10 bg-white/5'}`}>
              <span className="text-[9px] uppercase tracking-[0.12em] text-white/40">T{index + 1}</span>
              <span className="absolute bottom-3 left-3 text-sm text-white/90">{seats}</span>
              <span className={`absolute right-3 top-3 h-1.5 w-1.5 rounded-full ${active ? 'bg-emerald-400' : reserved ? 'bg-amber-400' : 'bg-white/25'}`} />
            </div>
          );
        })}
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-3">
        <div className="rounded-[18px] bg-white/5 p-3"><p className="text-[9px] uppercase tracking-[0.12em] text-white/40">{t('landing.editorial.mapWaiting', 'Waiting')}</p><p className="mt-2 text-xl">3</p></div>
        <div className="rounded-[18px] bg-white/5 p-3"><p className="text-[9px] uppercase tracking-[0.12em] text-white/40">{t('landing.editorial.mapSeated', 'Seated')}</p><p className="mt-2 text-xl">46</p></div>
        <div className="rounded-[18px] bg-white/5 p-3"><p className="text-[9px] uppercase tracking-[0.12em] text-white/40">{t('landing.editorial.mapNext', 'Next turn')}</p><p className="mt-2 text-xl">21m</p></div>
      </div>
    </div>
  );
}

export default function EditorialExperienceSection() {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();

  return (
    <section id="experience" className="mx-auto max-w-[1240px] px-6 py-24 sm:px-10 sm:py-32">
      <div className="mx-auto max-w-[880px] text-center">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-stone">{t('landing.editorial.experienceEyebrow', 'The guest experience')}</p>
        <h2 className="mt-5 font-serif text-[clamp(2.8rem,6vw,5.6rem)] leading-[0.96] tracking-[-0.045em] text-deep-charcoal">
          {t('landing.editorial.experienceTitle', 'One guest. One continuous thread. No operational theatre.')}
        </h2>
        <p className="mx-auto mt-7 max-w-[620px] text-base leading-relaxed text-muted-stone sm:text-lg">
          {t('landing.editorial.experienceBody', 'The conversation, the booking, the table, and the business signal stay connected. Your team sees one service, not five disconnected tools.')}
        </p>
      </div>

      <div className="mt-20 grid gap-12 lg:grid-cols-[.82fr_1.18fr] lg:items-start lg:gap-20">
        <div>
          {MOMENTS.map((moment, index) => (
            <motion.div
              key={moment.number}
              initial={reduceMotion ? false : { opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.55, delay: index * 0.08 }}
              className="grid grid-cols-[44px_1fr] gap-4 border-t hairline py-6 first:border-t-0 first:pt-0"
            >
              <span className="grid h-10 w-10 place-items-center rounded-full bg-soft-gray text-stone-gray"><ThiingsIcon name={moment.icon} pxSize={16} /></span>
              <div>
                <div className="flex items-baseline justify-between gap-4"><h3 className="font-sans text-base tracking-[-0.02em] text-deep-charcoal">{t(moment.title, MOMENT_FALLBACKS[index][0])}</h3><span className="font-mono text-[10px] text-muted-stone">{moment.number}</span></div>
                <p className="mt-2 text-sm leading-relaxed text-muted-stone">{t(moment.body, MOMENT_FALLBACKS[index][1])}</p>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="lg:sticky lg:top-28">
          <ServiceMap />
          <p className="mt-4 text-center text-[11px] text-muted-stone">{t('landing.editorial.mapCaption', 'One live view of demand, tables, guests, and timing.')}</p>
        </div>
      </div>
    </section>
  );
}
