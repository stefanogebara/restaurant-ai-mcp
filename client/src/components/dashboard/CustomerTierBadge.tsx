interface CustomerTierBadgeProps {
  tier?: 'new' | 'occasional' | 'regular' | 'vip' | 'at_risk';
  visitCount?: number;
  compact?: boolean;
}

const TIER_STYLES: Record<string, { bg: string; text: string; label: string; labelPt: string }> = {
  vip:        { bg: 'bg-amber-100', text: 'text-amber-800', label: 'VIP', labelPt: 'VIP' },
  regular:    { bg: 'bg-rose-100', text: 'text-rose-800', label: 'Regular', labelPt: 'Frequente' },
  occasional: { bg: 'bg-stone-100', text: 'text-stone-600', label: 'Occasional', labelPt: 'Ocasional' },
  new:        { bg: 'bg-blue-50', text: 'text-blue-700', label: 'New', labelPt: 'Novo' },
  at_risk:    { bg: 'bg-red-50', text: 'text-red-700', label: 'At Risk', labelPt: 'Em Risco' },
};

export default function CustomerTierBadge({ tier, visitCount, compact = false }: CustomerTierBadgeProps) {
  if (!tier || tier === 'new') return null;

  const style = TIER_STYLES[tier] || TIER_STYLES.occasional;

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
