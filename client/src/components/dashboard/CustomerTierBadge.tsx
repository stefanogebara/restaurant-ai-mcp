interface CustomerTierBadgeProps {
  tier?: 'new' | 'occasional' | 'regular' | 'vip' | 'at_risk';
  visitCount?: number;
  compact?: boolean;
}

const TIER_STYLES: Record<string, { bg: string; text: string; label: string; labelPt: string }> = {
  vip:        { bg: 'bg-[#9F1239]/10', text: 'text-[#9F1239]', label: 'VIP', labelPt: 'VIP' },
  regular:    { bg: 'bg-stone-100', text: 'text-stone-600', label: 'Regular', labelPt: 'Regular' },
  at_risk:    { bg: 'bg-amber-100', text: 'text-amber-700', label: 'At Risk', labelPt: 'Em Risco' },
  new:        { bg: 'bg-blue-50', text: 'text-blue-700', label: 'New', labelPt: 'Novo' },
};

// "occasional" is intentionally excluded — too common, adds noise
const HIDDEN_TIERS = new Set(['occasional']);

export default function CustomerTierBadge({ tier, visitCount, compact = false }: CustomerTierBadgeProps) {
  if (!tier || HIDDEN_TIERS.has(tier)) return null;

  const style = TIER_STYLES[tier] || TIER_STYLES.regular;

  if (compact) {
    return (
      <span className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded ${style.bg} ${style.text} uppercase tracking-wide`}>
        {style.labelPt}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded ${style.bg} ${style.text} uppercase tracking-wide`}>
      {tier === 'vip' && <span>★</span>}
      {style.labelPt}
      {visitCount != null && visitCount > 1 && (
        <span className="font-normal opacity-70">· {visitCount}x</span>
      )}
    </span>
  );
}
