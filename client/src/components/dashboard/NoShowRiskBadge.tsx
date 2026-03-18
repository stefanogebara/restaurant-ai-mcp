import { useTranslation } from 'react-i18next';

interface NoShowRiskBadgeProps {
  riskScore?: number;  // 0-100
  riskLevel?: 'low' | 'medium' | 'high' | 'very-high';
}

const RISK_STYLES = {
  low: { bg: 'bg-green-600/[8%]', text: 'text-green-600' },
  medium: { bg: 'bg-amber-500/[8%]', text: 'text-amber-500' },
  high: { bg: 'bg-red-600/[8%]', text: 'text-red-600' },
  'very-high': { bg: 'bg-red-700/[8%]', text: 'text-red-700' },
} as const;

const RISK_LABEL_KEYS = {
  low: 'dashboard.noShowRisk.low',
  medium: 'dashboard.noShowRisk.medium',
  high: 'dashboard.noShowRisk.high',
  'very-high': 'dashboard.noShowRisk.veryHigh',
} as const;

function getRiskLevel(score: number): 'low' | 'medium' | 'high' | 'very-high' {
  if (score <= 20) return 'low';
  if (score <= 50) return 'medium';
  if (score <= 75) return 'high';
  return 'very-high';
}

export default function NoShowRiskBadge({ riskScore, riskLevel }: NoShowRiskBadgeProps) {
  const { t } = useTranslation();
  if (riskScore === undefined && !riskLevel) return null;

  const level = riskLevel || getRiskLevel(riskScore ?? 0);
  const styles = RISK_STYLES[level] || RISK_STYLES.low;
  const labelKey = RISK_LABEL_KEYS[level] || RISK_LABEL_KEYS.low;

  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${styles.bg} ${styles.text}`}
      title={riskScore !== undefined ? t('dashboard.noShowRisk.probability', 'No-show probability: {{score}}%', { score: riskScore }) : undefined}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
      {riskScore !== undefined ? `${riskScore}%` : t(labelKey)}
    </span>
  );
}
