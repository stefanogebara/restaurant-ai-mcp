export function getTierBadge(confidence: number): { label: string; color: string } {
  if (confidence >= 80) return { label: 'VIP', color: 'bg-burgundy text-white' };
  if (confidence >= 50) return { label: 'Regular', color: 'bg-violet-600/20 text-violet-600' };
  return { label: 'New', color: 'bg-stone-gray/20 text-stone-gray' };
}

export function getDiningStyleColor(style: string): string {
  const map: Record<string, string> = {
    solo: 'bg-stone-gray/10 text-stone-gray border-stone-gray/30',
    couple: 'bg-burgundy/10 text-burgundy border-burgundy/30',
    family: 'bg-violet-600/10 text-violet-600 border-violet-600/30',
    business: 'bg-amber-600/10 text-amber-600 border-amber-600/30',
    group: 'bg-rose-600/10 text-rose-600 border-rose-600/30',
  };
  return map[style] || map.solo;
}

export function getSentimentColor(sentiment: string): string {
  if (sentiment.includes('positive') || sentiment === 'happy' || sentiment === 'satisfied') return 'text-rose-600';
  if (sentiment.includes('negative') || sentiment === 'frustrated' || sentiment === 'angry') return 'text-red-600';
  return 'text-amber-600';
}

export function formatCurrency(val: number | null): string {
  if (val == null) return '--';
  const lang = navigator.language || 'pt-BR';
  const isBRL = lang.toLowerCase().startsWith('pt');
  const cur = isBRL ? 'BRL' : 'USD';
  return new Intl.NumberFormat(isBRL ? 'pt-BR' : 'en-US', {
    style: 'currency',
    currency: cur,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val);
}
