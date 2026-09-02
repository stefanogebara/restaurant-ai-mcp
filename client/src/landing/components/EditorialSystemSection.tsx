import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ThiingsIcon, { type IconName } from '../../components/common/ThiingsIcon';

const CAPABILITIES: Array<{ icon: IconName; title: string; body: string; points: string[] }> = [
  { icon: 'chat', title: 'landing.editorial.cap1Title', body: 'landing.editorial.cap1Body', points: ['landing.editorial.cap1Point1', 'landing.editorial.cap1Point2', 'landing.editorial.cap1Point3'] },
  { icon: 'layout-grid', title: 'landing.editorial.cap2Title', body: 'landing.editorial.cap2Body', points: ['landing.editorial.cap2Point1', 'landing.editorial.cap2Point2', 'landing.editorial.cap2Point3'] },
  { icon: 'brain', title: 'landing.editorial.cap3Title', body: 'landing.editorial.cap3Body', points: ['landing.editorial.cap3Point1', 'landing.editorial.cap3Point2', 'landing.editorial.cap3Point3'] },
];

const FALLBACKS = [
  ['Conversations that complete the job', 'AI answers naturally, follows your policies, and moves the guest toward a confirmed reservation.', ['WhatsApp + voice + web', 'Multilingual responses', 'Deposits and reminders']],
  ['A floor that stays current', 'Every booking becomes live operating context for the host team, with no manual handoff.', ['Table suggestions', 'Waitlist and walk-ins', 'Service timeline']],
  ['Intelligence for the next decision', 'Seatable learns from service and turns the data into useful action for managers.', ['Revenue forecast', 'Staffing guidance', 'Guest retention']],
];

export default function EditorialSystemSection() {
  const { t } = useTranslation();

  return (
    <section id="system" className="px-3 pb-3">
      <div className="mx-auto max-w-[1380px] overflow-hidden rounded-[32px] bg-[#F1E9DE] px-6 py-20 sm:rounded-[38px] sm:px-12 sm:py-28 lg:px-20">
        <div className="grid gap-10 lg:grid-cols-[.72fr_1.28fr] lg:gap-20">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-stone">{t('landing.editorial.systemEyebrow', 'The Seatable system')}</p>
            <h2 className="mt-5 max-w-[560px] font-serif text-[clamp(2.8rem,5.4vw,5rem)] leading-[0.96] tracking-[-0.04em] text-deep-charcoal">
              {t('landing.editorial.systemTitle', 'Hospitality in front. Intelligence underneath.')}
            </h2>
            <p className="mt-7 max-w-[470px] text-base leading-relaxed text-muted-stone">
              {t('landing.editorial.systemBody', 'Guests feel a thoughtful host. Your team gets a connected operating system built for a busy room.')}
            </p>
          </div>

          <div>
            {CAPABILITIES.map((capability, index) => (
              <article key={capability.title} className="grid gap-5 border-t hairline py-8 first:pt-0 lg:grid-cols-[52px_1fr]">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-deep-charcoal text-white"><ThiingsIcon name={capability.icon} pxSize={18} /></span>
                <div>
                  <div className="grid gap-4 sm:grid-cols-[1fr_.9fr] sm:gap-8">
                    <div><h3 className="font-sans text-xl tracking-[-0.03em] text-deep-charcoal">{t(capability.title, FALLBACKS[index][0] as string)}</h3><p className="mt-3 text-sm leading-relaxed text-muted-stone">{t(capability.body, FALLBACKS[index][1] as string)}</p></div>
                    <ul className="space-y-2.5 pt-1">
                      {capability.points.map((point, pointIndex) => (
                        <li key={point} className="flex items-center gap-2.5 text-sm text-stone-gray"><ThiingsIcon name="check" pxSize={13} className="text-emerald-700" />{t(point, (FALLBACKS[index][2] as string[])[pointIndex])}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="mt-16 grid gap-px overflow-hidden rounded-[26px] bg-deep-charcoal/10 sm:grid-cols-3">
          <div className="bg-white/55 p-7"><p className="font-serif text-5xl tracking-[-0.04em] text-deep-charcoal">24/7</p><p className="mt-3 text-sm text-muted-stone">{t('landing.editorial.metric1', 'Every guest gets an answer')}</p></div>
          <div className="bg-white/55 p-7"><p className="font-serif text-5xl tracking-[-0.04em] text-deep-charcoal">3→1</p><p className="mt-3 text-sm text-muted-stone">{t('landing.editorial.metric2', 'Three channels, one service')}</p></div>
          <div className="bg-white/55 p-7"><p className="font-serif text-5xl tracking-[-0.04em] text-deep-charcoal">14</p><p className="mt-3 text-sm text-muted-stone">{t('landing.editorial.metric3', 'Days to try it free')}</p></div>
        </div>

        <div className="mt-16 flex flex-col items-start justify-between gap-6 border-t hairline pt-8 sm:flex-row sm:items-center">
          <p className="max-w-xl font-serif text-3xl leading-tight text-deep-charcoal">{t('landing.editorial.systemCtaText', 'See the whole system shaped around your restaurant.')}</p>
          <Link to="/demo/setup" className="inline-flex min-h-[52px] shrink-0 items-center gap-2 rounded-full bg-burgundy px-7 text-sm text-white transition-transform hover:-translate-y-0.5">{t('landing.editorial.systemCta', 'Build my preview')}<ThiingsIcon name="arrow-right" pxSize={15} /></Link>
        </div>
      </div>
    </section>
  );
}
