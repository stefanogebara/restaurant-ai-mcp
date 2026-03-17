/**
 * Analytics Guide Component
 *
 * Simple, jargon-free explanations of all analytics metrics
 * Helps restaurant owners understand what they're looking at
 */

import { useTranslation } from 'react-i18next';
import ThiingsIcon, { type IconName } from './ThiingsIcon';

interface AnalyticsGuideProps {
  page?: 'ml' | 'pricing' | 'ltv' | 'dna';
}

export default function AnalyticsGuide({ page = 'ml' }: AnalyticsGuideProps) {
  const { t } = useTranslation();

  const guides = {
    ml: {
      title: t('analytics.guide.ml.title'),
      iconName: 'target' as IconName,
      metrics: [
        {
          term: t('analytics.guide.ml.roiTerm'),
          simple: t('analytics.guide.ml.roiSimple'),
          example: t('analytics.guide.ml.roiExample'),
          good: t('analytics.guide.ml.roiGood'),
          iconName: 'dollar' as IconName
        },
        {
          term: t('analytics.guide.ml.successRateTerm'),
          simple: t('analytics.guide.ml.successRateSimple'),
          example: t('analytics.guide.ml.successRateExample'),
          good: t('analytics.guide.ml.successRateGood'),
          iconName: 'target' as IconName
        },
        {
          term: t('analytics.guide.ml.interventionsTerm'),
          simple: t('analytics.guide.ml.interventionsSimple'),
          example: t('analytics.guide.ml.interventionsExample'),
          good: t('analytics.guide.ml.interventionsGood'),
          iconName: 'users' as IconName
        },
        {
          term: t('analytics.guide.ml.valueSavedTerm'),
          simple: t('analytics.guide.ml.valueSavedSimple'),
          example: t('analytics.guide.ml.valueSavedExample'),
          good: t('analytics.guide.ml.valueSavedGood'),
          iconName: 'trending-up' as IconName
        }
      ]
    },
    pricing: {
      title: t('analytics.guide.pricing.title'),
      iconName: 'dollar' as IconName,
      metrics: [
        {
          term: t('analytics.guide.pricing.revenueLiftTerm'),
          simple: t('analytics.guide.pricing.revenueLiftSimple'),
          example: t('analytics.guide.pricing.revenueLiftExample'),
          good: t('analytics.guide.pricing.revenueLiftGood'),
          iconName: 'trending-up' as IconName
        },
        {
          term: t('analytics.guide.pricing.discountsTerm'),
          simple: t('analytics.guide.pricing.discountsSimple'),
          example: t('analytics.guide.pricing.discountsExample'),
          good: t('analytics.guide.pricing.discountsGood'),
          iconName: 'dollar' as IconName
        },
        {
          term: t('analytics.guide.pricing.netImpactTerm'),
          simple: t('analytics.guide.pricing.netImpactSimple'),
          example: t('analytics.guide.pricing.netImpactExample'),
          good: t('analytics.guide.pricing.netImpactGood'),
          iconName: 'target' as IconName
        },
        {
          term: t('analytics.guide.pricing.demandTerm'),
          simple: t('analytics.guide.pricing.demandSimple'),
          example: t('analytics.guide.pricing.demandExample'),
          good: t('analytics.guide.pricing.demandGood'),
          iconName: 'users' as IconName
        }
      ]
    },
    ltv: {
      title: t('analytics.guide.ltv.title'),
      iconName: 'users' as IconName,
      metrics: [
        {
          term: t('analytics.guide.ltv.ltvTerm'),
          simple: t('analytics.guide.ltv.ltvSimple'),
          example: t('analytics.guide.ltv.ltvExample'),
          good: t('analytics.guide.ltv.ltvGood'),
          iconName: 'dollar' as IconName
        },
        {
          term: t('analytics.guide.ltv.frequencyTerm'),
          simple: t('analytics.guide.ltv.frequencySimple'),
          example: t('analytics.guide.ltv.frequencyExample'),
          good: t('analytics.guide.ltv.frequencyGood'),
          iconName: 'clock' as IconName
        },
        {
          term: t('analytics.guide.ltv.avgSpendTerm'),
          simple: t('analytics.guide.ltv.avgSpendSimple'),
          example: t('analytics.guide.ltv.avgSpendExample'),
          good: t('analytics.guide.ltv.avgSpendGood'),
          iconName: 'dollar' as IconName
        },
        {
          term: t('analytics.guide.ltv.retentionTerm'),
          simple: t('analytics.guide.ltv.retentionSimple'),
          example: t('analytics.guide.ltv.retentionExample'),
          good: t('analytics.guide.ltv.retentionGood'),
          iconName: 'target' as IconName
        }
      ]
    },
    dna: {
      title: t('analytics.guide.dna.title'),
      iconName: 'users' as IconName,
      metrics: [
        {
          term: t('analytics.guide.dna.diningStyleTerm'),
          simple: t('analytics.guide.dna.diningStyleSimple'),
          example: t('analytics.guide.dna.diningStyleExample'),
          good: t('analytics.guide.dna.diningStyleGood'),
          iconName: 'users' as IconName
        },
        {
          term: t('analytics.guide.dna.spontaneityTerm'),
          simple: t('analytics.guide.dna.spontaneitySimple'),
          example: t('analytics.guide.dna.spontaneityExample'),
          good: t('analytics.guide.dna.spontaneityGood'),
          iconName: 'clock' as IconName
        },
        {
          term: t('analytics.guide.dna.occasionTerm'),
          simple: t('analytics.guide.dna.occasionSimple'),
          example: t('analytics.guide.dna.occasionExample'),
          good: t('analytics.guide.dna.occasionGood'),
          iconName: 'target' as IconName
        },
        {
          term: t('analytics.guide.dna.timePrefTerm'),
          simple: t('analytics.guide.dna.timePrefSimple'),
          example: t('analytics.guide.dna.timePrefExample'),
          good: t('analytics.guide.dna.timePrefGood'),
          iconName: 'clock' as IconName
        }
      ]
    }
  };

  const guide = guides[page];

  return (
    <div className="bg-burgundy/5 rounded-2xl border-2 border-burgundy/20 p-6">
      <div className="flex items-start gap-4 mb-6">
        <div className="w-12 h-12 bg-burgundy/20 rounded-full flex items-center justify-center flex-shrink-0">
          <ThiingsIcon name={guide.iconName} pxSize={24} />
        </div>
        <div>
          <h3 className="text-xl font-bold text-deep-charcoal mb-1">{guide.title}</h3>
          <p className="text-sm text-stone-gray">
            {t('analytics.guide.noMbaRequired')}
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {guide.metrics.map((metric, index) => {
          return (
            <div key={index} className="bg-white rounded-2xl border border-border-gray p-4 hover:border-burgundy/30 transition-colors shadow-md">
              <div className="flex items-start gap-3 mb-2">
                <div className="w-8 h-8 bg-burgundy/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <ThiingsIcon name={metric.iconName} pxSize={16} />
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-deep-charcoal text-sm mb-1">{metric.term}</h4>
                  <p className="text-xs text-green-600 font-semibold mb-2">
                    → {metric.simple}
                  </p>
                </div>
              </div>

              <div className="ml-11 space-y-2">
                <div className="text-xs">
                  <span className="text-stone-gray font-semibold">{t('analytics.guide.example')}</span>
                  <p className="text-stone-gray mt-1">{metric.example}</p>
                </div>
                <div className="text-xs">
                  <span className="text-green-600 font-semibold">{'\u2713'} {t('analytics.guide.whatsGood')}</span>
                  <p className="text-stone-gray mt-1">{metric.good}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 p-4 bg-amber-600/10 border border-amber-600/20 rounded-xl">
        <div className="flex items-start gap-2">
          <ThiingsIcon name="info" pxSize={20} className="flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <span className="font-semibold text-amber-600">{t('analytics.guide.tip')}</span>
            <span className="text-stone-gray ml-2">
              {t('analytics.guide.tipText', { icon: '' })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
