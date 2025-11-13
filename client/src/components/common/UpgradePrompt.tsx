import { Lock, Sparkles, ArrowRight } from 'lucide-react';
import { PLAN_NAMES, PLAN_PRICES, type PlanType } from '../../config/planFeatures';

interface UpgradePromptProps {
  requiredPlan: PlanType;
  feature: string;
  description?: string;
}

export default function UpgradePrompt({ requiredPlan, feature, description }: UpgradePromptProps) {
  const planName = PLAN_NAMES[requiredPlan];
  const price = PLAN_PRICES[requiredPlan as keyof typeof PLAN_PRICES];

  const handleUpgrade = () => {
    // Navigate to pricing page or open upgrade modal
    window.location.href = '/#pricing';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
        {/* Header with gradient */}
        <div className="bg-gradient-to-r from-primary/20 via-primary/10 to-accent/10 p-8 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 border-2 border-primary/20 mb-4">
            <Lock className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">{feature}</h1>
          {description && (
            <p className="text-muted-foreground text-lg">{description}</p>
          )}
        </div>

        {/* Body */}
        <div className="p-8">
          <div className="flex items-center gap-3 mb-6 p-4 bg-muted/50 rounded-lg border border-border">
            <Sparkles className="w-6 h-6 text-primary flex-shrink-0" />
            <p className="text-foreground">
              This feature is available on the <span className="font-bold text-primary">{planName}</span> plan
              {price && (
                <span className="text-muted-foreground"> (€{price}/month)</span>
              )}
            </p>
          </div>

          {/* Benefits */}
          <div className="space-y-3 mb-8">
            <h3 className="font-semibold text-foreground text-lg mb-4">Unlock with {planName}:</h3>
            {requiredPlan === 'professional' && (
              <ul className="space-y-2">
                <li className="flex items-start gap-2 text-muted-foreground">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                  <span>ML-powered performance insights and ROI tracking</span>
                </li>
                <li className="flex items-start gap-2 text-muted-foreground">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                  <span>Customer lifetime value analytics</span>
                </li>
                <li className="flex items-start gap-2 text-muted-foreground">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                  <span>Dynamic pricing rules and revenue optimization</span>
                </li>
                <li className="flex items-start gap-2 text-muted-foreground">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                  <span>Customer DNA behavioral profiling</span>
                </li>
              </ul>
            )}
            {requiredPlan === 'enterprise' && (
              <ul className="space-y-2">
                <li className="flex items-start gap-2 text-muted-foreground">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                  <span>Everything in Professional</span>
                </li>
                <li className="flex items-start gap-2 text-muted-foreground">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                  <span>Segovia tourism analytics and insights</span>
                </li>
                <li className="flex items-start gap-2 text-muted-foreground">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                  <span>Multi-location support</span>
                </li>
                <li className="flex items-start gap-2 text-muted-foreground">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                  <span>Dedicated account manager & 24/7 support</span>
                </li>
              </ul>
            )}
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleUpgrade}
              className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-3 px-6 rounded-lg transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg flex items-center justify-center gap-2"
            >
              <span>Upgrade to {planName}</span>
              <ArrowRight className="w-5 h-5" />
            </button>
            <button
              onClick={() => window.history.back()}
              className="flex-1 bg-muted hover:bg-muted/80 text-foreground font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              Go Back
            </button>
          </div>

          {/* Footer note */}
          <p className="text-center text-sm text-muted-foreground mt-6">
            14-day free trial • Cancel anytime
          </p>
        </div>
      </div>
    </div>
  );
}
