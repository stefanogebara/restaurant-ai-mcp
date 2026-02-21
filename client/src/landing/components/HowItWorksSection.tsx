import { useTranslation } from 'react-i18next';

export default function HowItWorksSection() {
  const { t } = useTranslation();

  const steps = ['step1', 'step2', 'step3'] as const;

  return (
    <section className="py-24 px-6 sm:px-16 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="text-center mb-16">
        <div className="text-xs font-semibold tracking-[2px] uppercase text-burgundy mb-4">
          {t('landing.howItWorks.label')}
        </div>
        <h2 className="font-serif text-4xl sm:text-[48px] font-medium tracking-tight text-deep-charcoal">
          {t('landing.howItWorks.heading')}<br />{t('landing.howItWorks.headingLine2')}
        </h2>
      </div>

      {/* Steps */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-center">
        {steps.map((step, i) => (
          <div key={step}>
            <div className="font-serif text-[56px] font-normal text-[rgba(159,18,57,0.12)] leading-none mb-5">
              0{i + 1}
            </div>
            <h3 className="text-lg font-semibold text-deep-charcoal tracking-tight mb-3">
              {t(`landing.howItWorks.${step}.title`)}
            </h3>
            <p className="text-sm text-warm-stone font-light leading-relaxed">
              {t(`landing.howItWorks.${step}.desc`)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
