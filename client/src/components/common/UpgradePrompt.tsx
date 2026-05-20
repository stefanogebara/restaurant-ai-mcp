import { useTranslation } from 'react-i18next';
import ThiingsIcon from './ThiingsIcon';
import { PLAN_NAMES, getPlanPrices, type PlanType } from '../../config/planFeatures';
import { currencyFromLanguage, formatPriceLocale, type SupportedCurrency } from '../../utils/currency';
import { useSubscriptionData } from '../../hooks/useSubscriptionManage';

interface UpgradePromptProps {
  requiredPlan: PlanType;
  feature: string;
  description?: string;
}

export default function UpgradePrompt({ requiredPlan, feature, description }: UpgradePromptProps) {
  const { t, i18n } = useTranslation();
  const planName = PLAN_NAMES[requiredPlan];
  // T.2 currency parity: an authenticated owner sees an upgrade prompt
  // because they're already a customer. Show the price in THEIR billing
  // currency (from the subscription record), not the language-derived
  // currency — otherwise an English-speaking BR-billed owner sees $97
  // here but gets charged R$497 at checkout. Falls back to language-
  // derived currency only if the subscription hasn't loaded yet
  // (e.g. on the first paint before useSubscriptionData resolves).
  const { data: subscription } = useSubscriptionData();
  const currency: SupportedCurrency =
    (subscription?.currency as SupportedCurrency | undefined) ?? currencyFromLanguage(i18n.language);
  const prices = getPlanPrices(currency);
  const price = prices[requiredPlan as keyof typeof prices];
  const priceDisplay = price ? formatPriceLocale(price, currency) : '';

  const handleUpgrade = () => {
    window.location.href = '/#pricing';
  };

  return (
    <div className="min-h-screen bg-warm-white flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white border border-border-gray rounded-2xl overflow-hidden">
        {/* Header with gradient */}
        <div className="bg-burgundy/10 p-8 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-burgundy/10 border-2 border-burgundy/20 mb-4">
            <ThiingsIcon name="lock" pxSize={40} />
          </div>
          <h1 className="text-3xl font-bold text-deep-charcoal mb-2">{feature}</h1>
          {description && (
            <p className="text-stone-gray text-lg">{description}</p>
          )}
        </div>

        {/* Body */}
        <div className="p-8">
          <div className="flex items-center gap-3 mb-6 p-4 bg-soft-gray rounded-xl border border-border-gray">
            <ThiingsIcon name="sparkles" pxSize={24} className="flex-shrink-0" />
            <p className="text-deep-charcoal">
              {t('upgrade.featureAvailable', { planName })}
              {priceDisplay && (
                <span className="text-stone-gray"> ({t('upgrade.pricePerMonth', { price: priceDisplay })})</span>
              )}
            </p>
          </div>

          {/* Benefits */}
          <div className="space-y-3 mb-8">
            <h3 className="font-semibold text-deep-charcoal text-lg mb-4">{t('upgrade.unlockWith', { planName })}:</h3>
            {(requiredPlan === 'growth' || requiredPlan === 'scale') && (
              <ul className="space-y-2">
                <li className="flex items-start gap-2 text-stone-gray">
                  <div className="w-1.5 h-1.5 rounded-full bg-burgundy mt-2 flex-shrink-0" />
                  <span>{t('upgrade.benefits.mlInsights')}</span>
                </li>
                <li className="flex items-start gap-2 text-stone-gray">
                  <div className="w-1.5 h-1.5 rounded-full bg-burgundy mt-2 flex-shrink-0" />
                  <span>{t('upgrade.benefits.customerLtv')}</span>
                </li>
                <li className="flex items-start gap-2 text-stone-gray">
                  <div className="w-1.5 h-1.5 rounded-full bg-burgundy mt-2 flex-shrink-0" />
                  <span>{t('upgrade.benefits.voiceAi')}</span>
                </li>
                <li className="flex items-start gap-2 text-stone-gray">
                  <div className="w-1.5 h-1.5 rounded-full bg-burgundy mt-2 flex-shrink-0" />
                  <span>{t('upgrade.benefits.customerDna')}</span>
                </li>
              </ul>
            )}
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={handleUpgrade}
              className="flex-1 bg-burgundy hover:bg-burgundy-dark text-white font-semibold py-3 px-6 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <span>{t('upgrade.upgradeTo', { planName })}</span>
              <ThiingsIcon name="arrow-right" pxSize={20} />
            </button>
            <button
              type="button"
              onClick={() => window.history.back()}
              className="flex-1 bg-soft-gray hover:bg-border-gray text-deep-charcoal font-semibold py-3 px-6 rounded-xl transition-colors"
            >
              {t('upgrade.goBack')}
            </button>
          </div>

          {/* Footer note */}
          <p className="text-center text-sm text-stone-gray mt-6">
            {t('upgrade.trialNote')}
          </p>
        </div>
      </div>
    </div>
  );
}
