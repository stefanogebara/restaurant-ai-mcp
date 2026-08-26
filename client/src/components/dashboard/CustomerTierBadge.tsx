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
    bg: 'bg-burgundy/[0.10]',
    text: 'text-burgundy',
    labels: { en: 'VIP', 'pt-BR': 'VIP', es: 'VIP' },
  },
  regular: {
    bg: 'bg-muted-stone/[0.10]',
    text: 'text-muted-stone',
    labels: { en: 'Regular', 'pt-BR': 'Frequente', es: 'Frecuente' },
  },
  at_risk: {
    bg: 'bg-amber-600/[0.12]',
    text: 'text-amber-700',
    labels: { en: 'At risk', 'pt-BR': 'Em risco', es: 'En riesgo' },
  },
  // 'new' era bg-stone-50/text-stone-700 — azul não existe no Warm Glass e
  // fazia o cliente novo parecer um estado de sistema, não uma pessoa.
  new: {
    bg: 'bg-emerald-600/[0.10]',
    text: 'text-emerald-700',
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
      <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-[46px] ${style.bg} ${style.text} uppercase tracking-[0.08em]`}>
        {label}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-0.5 rounded-[46px] ${style.bg} ${style.text} uppercase tracking-[0.08em]`}>
      {tier === 'vip' && (
        <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z" />
        </svg>
      )}
      {label}
      {visitCount != null && visitCount > 1 && (
        <span className="font-normal opacity-70">· {visitCount}x</span>
      )}
    </span>
  );
}
