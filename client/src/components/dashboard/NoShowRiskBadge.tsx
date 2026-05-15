import { useTranslation } from 'react-i18next';

interface NoShowRiskBadgeProps {
  riskScore?: number;  // 0-100
  riskLevel?: 'low' | 'medium' | 'high' | 'very-high';
}

const RISK_STYLES = {
  low: { bg: 'bg-rose-600/[8%]', text: 'text-rose-600' },
  medium: { bg: 'bg-amber-500/[8%]', text: 'text-amber-500' },
  high: { bg: 'bg-red-600/[8%]', text: 'text-red-600' },
  'very-high': { bg: 'bg-red-700/[8%]', text: 'text-red-700' },
} as const;

/**
 * Host-facing labels per risk level. Previously the badge rendered a bare
 * percentage ("73%") with no anchor — Carla had no idea whether that meant
 * "73 out of 100 reservations skip" or "73% chance THIS one skips". Now we
 * render an actionable human label as primary text; the precise percentage
 * stays in the tooltip for power users + analytics-minded staff.
 */
const RISK_LABEL_KEYS = {
  low: 'dashboard.noShowRisk.lowAction',
  medium: 'dashboard.noShowRisk.mediumAction',
  high: 'dashboard.noShowRisk.highAction',
  'very-high': 'dashboard.noShowRisk.veryHighAction',
} as const;

const RISK_DEFAULT_LABELS = {
  low: 'Likely to show',
  medium: 'Worth a reminder',
  high: 'Likely to skip',
  'very-high': 'Call to confirm',
} as const;

function getRiskLevel(score: number): 'low' | 'medium' | 'high' | 'very-high' {
  if (score <= 20) return 'low';
  if (score <= 50) return 'medium';
  if (score <= 75) return 'high';
  return 'very-high';
}

export default function NoShowRiskBadge({ riskScore, riskLevel }: NoShowRiskBadgeProps) {
  const { t } = useTranslation();
  if ((riskScore === undefined || riskScore === null) && !riskLevel) return null;

  // Only show the badge for non-low risk — "Likely to show" on every
  // confirmed reservation would be visual noise. The score-only signal
  // remains in the tooltip for hosts who hover.
  const level = riskLevel || getRiskLevel(riskScore ?? 0);
  if (level === 'low') return null;

  const styles = RISK_STYLES[level] || RISK_STYLES.low;
  const labelKey = RISK_LABEL_KEYS[level] || RISK_LABEL_KEYS.low;
  const label = t(labelKey, RISK_DEFAULT_LABELS[level]);

  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${styles.bg} ${styles.text}`}
      title={riskScore !== undefined ? t('dashboard.noShowRisk.probability', 'No-show probability: {{score}}%', { score: riskScore }) : undefined}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
      {label}
    </span>
  );
}
