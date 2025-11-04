/**
 * Analytics Guide Component
 *
 * Simple, jargon-free explanations of all analytics metrics
 * Helps restaurant owners understand what they're looking at
 */

import { Info, TrendingUp, DollarSign, Target, Users, Clock } from 'lucide-react';

interface AnalyticsGuideProps {
  page?: 'ml' | 'pricing' | 'ltv' | 'dna';
}

export default function AnalyticsGuide({ page = 'ml' }: AnalyticsGuideProps) {
  const guides = {
    ml: {
      title: "Understanding ML Performance (in Plain English)",
      icon: Target,
      metrics: [
        {
          term: "ROI (Return on Investment)",
          simple: "Money saved vs money spent",
          example: "Spent €10 on calls → Prevented €70 in lost revenue → ROI = 600%",
          good: "Anything above 300% is excellent (€3 saved per €1 spent)",
          icon: DollarSign
        },
        {
          term: "Success Rate",
          simple: "How often our predictions work",
          example: "Made 10 confirmation calls → 7 customers showed up → 70% success",
          good: "Above 60% means the AI is helping",
          icon: Target
        },
        {
          term: "Interventions",
          simple: "Actions we take to prevent no-shows",
          example: "Calling high-risk customers, sending reminders, requiring deposits",
          good: "More interventions = better at preventing losses",
          icon: Users
        },
        {
          term: "Value Saved",
          simple: "Money you didn't lose",
          example: "Customer was going to no-show (€50 lost) → We called them → They came → €50 saved",
          good: "Higher is better - means fewer empty tables",
          icon: TrendingUp
        }
      ]
    },
    pricing: {
      title: "Understanding Dynamic Pricing (in Plain English)",
      icon: DollarSign,
      metrics: [
        {
          term: "Revenue Lift",
          simple: "Extra money from charging more during busy times",
          example: "Normal price: €50 → Friday night price: €65 → Revenue lift: €15",
          good: "Positive lift = making more money without more customers",
          icon: TrendingUp
        },
        {
          term: "Discounts Given",
          simple: "Money given away to fill empty tables",
          example: "Tuesday 6pm discount: 20% off (€10 per person)",
          good: "OK if it fills tables that would be empty anyway",
          icon: DollarSign
        },
        {
          term: "Net Impact",
          simple: "Revenue lift minus discounts = actual profit",
          example: "Made €1,000 from surges, gave €300 in discounts = €700 net profit",
          good: "Positive is good! Aim for at least €3 made per €1 given away",
          icon: Target
        },
        {
          term: "Demand Level",
          simple: "How busy you are",
          example: "Low = lots of empty tables, Surge = fully booked",
          good: "Surge pricing during high demand, discounts during low",
          icon: Users
        }
      ]
    },
    ltv: {
      title: "Understanding Customer Value (in Plain English)",
      icon: Users,
      metrics: [
        {
          term: "LTV (Lifetime Value)",
          simple: "Total money a customer will spend over time",
          example: "Customer visits 4x per year, spends €50 each time, stays 3 years = €600 LTV",
          good: "Higher LTV = more valuable customer, worth investing in",
          icon: DollarSign
        },
        {
          term: "Visit Frequency",
          simple: "How often they come back",
          example: "Once a month, twice a year, every week, etc.",
          good: "More frequent = more predictable revenue",
          icon: Clock
        },
        {
          term: "Average Spend",
          simple: "How much they typically spend per visit",
          example: "Always orders wine and appetizers = higher spend",
          good: "High spenders deserve VIP treatment",
          icon: DollarSign
        },
        {
          term: "Retention Risk",
          simple: "Chance they'll stop coming",
          example: "Haven't visited in 6 months = high risk of losing them",
          good: "Catch at-risk customers early with special offers",
          icon: Target
        }
      ]
    },
    dna: {
      title: "Understanding Customer DNA (in Plain English)",
      icon: Users,
      metrics: [
        {
          term: "Dining Style Profile",
          simple: "What type of diner they are",
          example: "Business lunches, romantic dates, family dinners, solo meals",
          good: "Helps you prepare (quiet table for business, kid menu for families)",
          icon: Users
        },
        {
          term: "Booking Spontaneity",
          simple: "How far ahead they plan",
          example: "Same-day booker vs plans 2 weeks ahead",
          good: "Planners are reliable, spontaneous need reminders",
          icon: Clock
        },
        {
          term: "Occasion Type",
          simple: "Why they're dining",
          example: "Birthday, anniversary, business meeting, casual meal",
          good: "Know what they're celebrating = better service",
          icon: Target
        },
        {
          term: "Time Preferences",
          simple: "When they like to dine",
          example: "Always Friday 8pm, or Tuesday lunch, or weekend brunch",
          good: "Predict when they'll book next, send targeted offers",
          icon: Clock
        }
      ]
    }
  };

  const guide = guides[page];
  const Icon = guide.icon;

  return (
    <div className="bg-gradient-to-br from-blue-500/5 to-purple-500/5 rounded-lg border-2 border-blue-500/20 p-6">
      <div className="flex items-start gap-4 mb-6">
        <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center flex-shrink-0">
          <Icon className="w-6 h-6 text-blue-400" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-foreground mb-1">{guide.title}</h3>
          <p className="text-sm text-muted-foreground">
            No MBA required - just simple explanations of what you're seeing
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {guide.metrics.map((metric, index) => {
          const MetricIcon = metric.icon;
          return (
            <div key={index} className="bg-card rounded-lg border border-border p-4 hover:border-blue-500/30 transition-colors">
              <div className="flex items-start gap-3 mb-2">
                <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <MetricIcon className="w-4 h-4 text-blue-400" />
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-foreground text-sm mb-1">{metric.term}</h4>
                  <p className="text-xs text-emerald-400 font-semibold mb-2">
                    → {metric.simple}
                  </p>
                </div>
              </div>

              <div className="ml-11 space-y-2">
                <div className="text-xs">
                  <span className="text-muted-foreground font-semibold">Example:</span>
                  <p className="text-muted-foreground mt-1">{metric.example}</p>
                </div>
                <div className="text-xs">
                  <span className="text-emerald-400 font-semibold">✓ What's Good:</span>
                  <p className="text-muted-foreground mt-1">{metric.good}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
        <div className="flex items-start gap-2">
          <Info className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <span className="font-semibold text-amber-400">Tip:</span>
            <span className="text-muted-foreground ml-2">
              Hover over any metric with a <Info className="w-3 h-3 inline" /> icon for more details.
              Don't worry if some numbers are zero - your data will build up over time!
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
