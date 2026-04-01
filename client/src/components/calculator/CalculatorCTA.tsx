import { useTranslation } from 'react-i18next';

export default function CalculatorCTA() {
  const { t } = useTranslation();

  return (
    <section className="mt-12 text-center">
      <h2 className="text-2xl font-semibold text-deep-charcoal mb-3">
        {t('calculator.ctaTitle', 'Reduza seus no-shows em até 90%')}
      </h2>
      <p className="text-muted-stone text-sm mb-6 max-w-md mx-auto">
        {t('calculator.ctaDescription', 'Confirmações automáticas por WhatsApp, lembretes inteligentes e depósitos opcionais.')}
      </p>
      <a
        href="/live-demo"
        className="inline-block bg-[#1C1917] text-white px-8 py-3 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
      >
        {t('calculator.ctaButton', 'Testar grátis')}
      </a>
    </section>
  );
}
