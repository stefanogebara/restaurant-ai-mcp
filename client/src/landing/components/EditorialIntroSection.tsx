import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../../components/common/ThiingsIcon';

export default function EditorialIntroSection() {
  const { t } = useTranslation();

  return (
    <section className="mx-auto max-w-[1240px] px-6 py-24 sm:px-10 sm:py-32">
      <div className="mx-auto max-w-[900px] text-center">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-stone">{t('landing.editorial.introEyebrow', 'Built around service')}</p>
        <h2 className="mt-5 font-serif text-[clamp(2.8rem,6vw,5.7rem)] leading-[0.96] tracking-[-0.045em] text-deep-charcoal">
          {t('landing.editorial.introTitle', 'Technology that disappears into good hospitality.')}
        </h2>
      </div>

      <div className="mt-20 grid gap-5 md:grid-cols-[1fr_.72fr] md:items-end">
        <div className="landing-dining-field relative min-h-[500px] overflow-hidden rounded-[30px] p-7 text-white sm:p-10">
          <div className="absolute inset-0 bg-deep-charcoal/15" aria-hidden="true" />
          <div className="relative flex min-h-[430px] flex-col justify-between">
            <span className="grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-white/10 backdrop-blur-glass-chip"><ThiingsIcon name="dining" pxSize={18} /></span>
            <div className="max-w-[470px]">
              <p className="font-serif text-[clamp(2.1rem,4.4vw,4rem)] leading-[0.98] tracking-[-0.035em]">{t('landing.editorial.introPanelTitle', 'Your team stays present. Seatable handles the invisible work.')}</p>
              <p className="mt-5 max-w-[420px] text-sm leading-relaxed text-white/70">{t('landing.editorial.introPanelBody', 'Questions answered, reservations organized, guests remembered, and tonight’s service already understood.')}</p>
            </div>
          </div>
        </div>

        <div className="rounded-[30px] bg-[#E9D7C2] p-7 sm:p-9">
          <div className="flex items-center justify-between"><p className="text-[10px] uppercase tracking-[0.16em] text-muted-stone">{t('landing.editorial.quoteLabel', 'The service principle')}</p><span className="font-mono text-[10px] text-muted-stone">01—04</span></div>
          <p className="mt-24 font-serif text-4xl leading-[1.02] tracking-[-0.035em] text-deep-charcoal sm:text-5xl">“{t('landing.editorial.quote', 'The best system gives the room more attention, not more admin.')}”</p>
          <div className="mt-10 border-t hairline pt-5"><p className="text-sm text-deep-charcoal">Seatable</p><p className="mt-1 text-xs text-muted-stone">{t('landing.editorial.quoteRole', 'Restaurant operating system')}</p></div>
        </div>
      </div>
    </section>
  );
}
