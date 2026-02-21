import { useTranslation } from 'react-i18next';

export default function SocialProofSection() {
  const { t } = useTranslation();

  return (
    <section className="py-16 px-6 sm:px-16 text-center border-y border-border-gray">
      <p className="text-xs font-semibold tracking-[2px] uppercase text-muted-stone mb-4">
        {t('landing.socialProof.label')}
      </p>
      <p className="text-2xl font-serif font-medium text-deep-charcoal mb-2">
        {t('landing.socialProof.heading')}
      </p>
      <p className="text-sm text-warm-stone max-w-[420px] mx-auto">
        {t('landing.socialProof.subtext')}
      </p>
    </section>
  );
}
