import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import ThiingsIcon, { type IconName } from '../../components/common/ThiingsIcon';

const CHANNELS: Array<{ icon: IconName; key: string; fallback: string }> = [
  { icon: 'chat', key: 'landing.editorial.channelWhatsapp', fallback: 'WhatsApp' },
  { icon: 'phone-call', key: 'landing.editorial.channelVoice', fallback: 'Voice' },
  { icon: 'user', key: 'landing.editorial.channelWalkIn', fallback: 'Walk-in' },
];

export default function HeroReservationStage() {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const transition = reduceMotion ? { duration: 0 } : { duration: 0.7, ease: [0.16, 1, 0.3, 1] as const };

  return (
    <div className="relative mx-auto w-full max-w-[570px]" aria-label={t('landing.editorial.stageAria', 'A live reservation moving from conversation to the restaurant floor')}>
      <motion.div initial={reduceMotion ? false : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ ...transition, delay: 0.18 }} className="relative overflow-hidden rounded-[30px] border border-white/50 bg-white/75 p-4 shadow-[0_24px_70px_rgba(28,25,23,0.18)] backdrop-blur-[28px] sm:p-5">
        <div className="flex items-center justify-between border-b border-deep-charcoal/10 pb-4">
          <div><p className="text-[10px] uppercase tracking-[0.16em] text-muted-stone">{t('landing.editorial.stageTonight', 'Tonight')}</p><p className="mt-1 text-[17px] tracking-[-0.02em] text-deep-charcoal">{t('landing.editorial.stageService', 'Friday service')}</p></div>
          <span className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-2 text-xs text-stone-gray"><span className="h-2 w-2 rounded-full bg-emerald-500" />{t('landing.editorial.stageLive', 'Live')}</span>
        </div>

        <div className="grid gap-3 pt-4 sm:grid-cols-[1.05fr_.95fr]">
          <div className="rounded-[22px] bg-deep-charcoal p-4 text-white">
            <div className="mb-5 flex items-center gap-2 text-[11px] text-white/60"><span className="grid h-7 w-7 place-items-center rounded-full bg-white/10"><ThiingsIcon name="chat" pxSize={13} /></span>{t('landing.editorial.stageConversation', 'Guest conversation')}</div>
            <motion.div initial={reduceMotion ? false : { opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ ...transition, delay: 0.55 }} className="ml-auto max-w-[88%] rounded-[18px_18px_4px_18px] bg-white/10 px-3 py-2.5 text-[12px] leading-relaxed">{t('landing.editorial.guestMessage', 'A table for 4 tomorrow at 8?')}</motion.div>
            <motion.div initial={reduceMotion ? false : { opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ ...transition, delay: 0.92 }} className="mt-2 max-w-[94%] rounded-[18px_18px_18px_4px] bg-white px-3 py-2.5 text-[12px] leading-relaxed text-deep-charcoal">{t('landing.editorial.aiMessage', 'Absolutely. I have the terrace or the main room available.')}</motion.div>
            <div className="mt-5 flex gap-1.5">
              {CHANNELS.map((channel) => <span key={channel.key} className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/5 text-white/70" title={t(channel.key, channel.fallback)}><ThiingsIcon name={channel.icon} pxSize={13} /></span>)}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <motion.div initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...transition, delay: 1.18 }} className="rounded-[22px] bg-[#F5F1EA] p-4">
              <div className="flex items-start justify-between gap-2"><span className="grid h-9 w-9 place-items-center rounded-full bg-emerald-100 text-emerald-700"><ThiingsIcon name="calendar-check" pxSize={16} /></span><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-emerald-700">{t('landing.editorial.stageConfirmed', 'Confirmed')}</span></div>
              <p className="mt-5 text-[11px] text-muted-stone">{t('landing.editorial.stageGuest', 'Marina · party of 4')}</p><p className="mt-1 text-[23px] tracking-[-0.04em] text-deep-charcoal">20:00 · T12</p>
            </motion.div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[20px] bg-white/70 p-3.5"><p className="text-[9px] uppercase tracking-[0.14em] text-muted-stone">{t('landing.editorial.stageCovers', 'Covers')}</p><p className="mt-3 text-2xl tracking-[-0.05em] text-deep-charcoal">82</p><p className="mt-1 text-[10px] text-emerald-700">+12%</p></div>
              <div className="rounded-[20px] bg-[#F7EBDD] p-3.5"><p className="text-[9px] uppercase tracking-[0.14em] text-muted-stone">{t('landing.editorial.stageRevenue', 'Forecast')}</p><p className="mt-3 text-[19px] tracking-[-0.05em] text-deep-charcoal">R$ 18.4k</p><p className="mt-1 text-[10px] text-ocre-700">{t('landing.editorial.stageModel', 'live model')}</p></div>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div initial={reduceMotion ? false : { opacity: 0, y: 16, rotate: 2 }} animate={{ opacity: 1, y: 0, rotate: -2 }} transition={{ ...transition, delay: 1.45 }} className="absolute -bottom-5 -left-2 hidden items-center gap-3 rounded-[18px] border border-white/60 bg-white/80 px-4 py-3 text-deep-charcoal shadow-glass-card backdrop-blur-glass-card sm:flex">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-ocre-100 text-ocre-700"><ThiingsIcon name="sparkles" pxSize={14} /></span>
        <div><p className="text-[10px] uppercase tracking-[0.14em] text-muted-stone">{t('landing.editorial.stageManagerAi', 'Manager AI')}</p><p className="text-xs">{t('landing.editorial.stageInsight', 'Terrace will fill first tonight.')}</p></div>
      </motion.div>
    </div>
  );
}
