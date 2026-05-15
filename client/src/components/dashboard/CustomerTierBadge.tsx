import { useTranslation } from 'react-i18next';

interface CustomerTierBadgeProps {
  tier?: 'new' | 'occasional' | 'regular' | 'vip' | 'at_risk';
  visitCount?: number;
  compact?: boolean;
}

/**
 * Tier label per locale. Previously this component ALWAYS rendered the PT-BR
 * label (`labelPt`), so an English-speaking host saw "Em Risco" / "Novo" mixed
 * into otherwise-English UI. Now keyed off the active i18n language.
 */
const TIER_STYLES: Record<string, {
  bg: string;
  text: string;
  labels: Record<string, string>;
}> = {
  vip: {
    bg: 'bg-[#9F1239]/10',
    text: 'text-[#9F1239]',
    labels: { en: 'VIP', 'pt-BR': 'VIP', es: 'VIP' },
  },
  regular: {
    bg: 'bg-stone-100',
    text: 'text-stone-600',
    labels: { en: 'Regular', 'pt-BR': 'Frequente', es: 'Frecuente' },
  },
  at_risk: {
    bg: 'bg-amber-100',
    text: 'text-amber-700',
    labels: { en: 'At risk', 'pt-BR': 'Em risco', es: 'En riesgo' },
  },
  new: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    labels: { en: 'New', 'pt-BR': 'Novo', es: 'Nuevo' },
  },
};

// "occasional" is intentionally excluded — too common, adds noise
const HIDDEN_TIERS = new Set(['occasional']);

function resolveLabel(labels: Record<string, string>, lang: string): string {
  if (labels[lang]) return labels[lang];
  // Match the language root (e.g. "pt-BR" if the active locale is "pt").
  const root = lang.split('-')[0];
  const match = Object.keys(labels).find((key) => key.split('-')[0] === root);
  return match ? labels[match] : labels.en;
}

export default function CustomerTierBadge({ tier, visitCount, compact = false }: CustomerTierBadgeProps) {
  const { i18n } = useTranslation();

  if (!tier || HIDDEN_TIERS.has(tier)) return null;

  const style = TIER_STYLES[tier] || TIER_STYLES.regular;
  const label = resolveLabel(style.labels, i18n.language || 'en');

  if (compact) {
    return (
      <span className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded ${style.bg} ${style.text} uppercase tracking-wide`}>
        {label}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded ${style.bg} ${style.text} uppercase tracking-wide`}>
      {tier === 'vip' && <span>★</span>}
      {label}
      {visitCount != null && visitCount > 1 && (
        <span className="font-normal opacity-70">· {visitCount}x</span>
      )}
    </span>
  );
}
