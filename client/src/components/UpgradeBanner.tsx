import { useTranslation } from 'react-i18next';
import ThiingsIcon from './common/ThiingsIcon';

interface UpgradeBannerProps {
  feature: string;
  compact?: boolean;
}

function goToPricing() {
  window.location.href = '/#pricing';
}

// Plan-name reference: per CLAUDE.md the active plans are Essencial /
// Profissional / Enterprise. The legacy "Growth / Scale" naming surfaced
// here (and in several i18n keys) was caught in the 2026-05-18 audit —
// Voz e Chamadas showed "Disponível nos planos Growth e Scale" with a
// "Assinar Profissional" CTA right below it. Unified to Profissional.
export default function UpgradeBanner({ feature, compact = false }: UpgradeBannerProps) {
  const { t } = useTranslation();
  if (compact) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <div>
          <div className="font-semibold text-deep-charcoal">{feature}</div>
          <div className="text-sm text-stone-gray">{t('upgrade.availableOnPro', 'Available on Profissional')}</div>
        </div>
        <button
          type="button"
          onClick={goToPricing}
          className="rounded-lg bg-burgundy px-3 py-2 text-sm font-semibold text-white hover:bg-burgundy-dark"
        >
          {t('upgrade.cta', 'Upgrade')}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-rose-600/10 p-2 text-rose-700">
          <ThiingsIcon name="sparkles" pxSize={20} />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-deep-charcoal">{t('upgrade.unlock', 'Unlock')} {feature}</h3>
          <p className="mt-1 text-sm text-stone-gray">
            {t('upgrade.unlockDescription', 'Upgrade to the Profissional plan to access this feature')}
          </p>
          <button
            type="button"
            onClick={goToPricing}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-burgundy px-4 py-2 text-sm font-semibold text-white hover:bg-burgundy-dark"
          >
            {t('upgrade.viewPlans', 'View Plans')}
            <ThiingsIcon name="arrow-right" pxSize={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
