import { useTranslation } from 'react-i18next';

export default function FeaturesGrid() {
  const { t } = useTranslation();

  const features = [
    { icon: '☎', key: 'voice' },
    { icon: '✉', key: 'whatsapp' },
    { icon: '⚙', key: 'dashboard' },
    { icon: '★', key: 'memory' },
    { icon: '◉', key: 'tables' },
    { icon: '◆', key: 'analytics' },
  ] as const;

  return (
    <section id="features" className="py-24 px-6 sm:px-16 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="mb-16">
        <div className="text-xs font-semibold tracking-[2px] uppercase text-burgundy mb-4">
          {t('landing.features.label')}
        </div>
        <h2 className="font-serif text-4xl sm:text-[48px] font-medium leading-[1.15] tracking-tight text-deep-charcoal mb-4">
          {t('landing.features.heading')}<br />{t('landing.features.headingLine2')}
        </h2>
        <p className="text-[17px] text-warm-stone font-light leading-[1.7] max-w-[480px]">
          {t('landing.features.subtitle')}
        </p>
      </div>

      {/* 3x2 Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-[2px] bg-border-gray rounded-2xl overflow-hidden">
        {features.map((f, i) => (
          <div key={i} className="bg-white p-10 sm:p-12 hover:bg-warm-white transition-colors">
            <div className="w-12 h-12 rounded-xl bg-burgundy/[6%] flex items-center justify-center mb-6 text-xl text-burgundy">
              {f.icon}
            </div>
            <h3 className="text-lg font-semibold text-deep-charcoal tracking-tight mb-3">
              {t(`landing.features.${f.key}.title`)}
            </h3>
            <p className="text-sm text-warm-stone font-light leading-relaxed">
              {t(`landing.features.${f.key}.desc`)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
