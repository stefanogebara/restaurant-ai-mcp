import { useTranslation } from 'react-i18next';
import ThiingsIcon, { type IconName } from '../common/ThiingsIcon';

interface RiskBadgeProps {
  riskLevel?: 'low' | 'medium' | 'high' | 'very-high';
  riskScore?: number;
  size?: 'sm' | 'md' | 'lg';
  showTooltip?: boolean;
}

const RISK_STYLES = {
  'low': {
    iconName: 'green-check' as IconName,
    color: 'text-green-400',
    bg: 'bg-green-500/20',
    border: 'border-green-500/30',
  },
  'medium': {
    iconName: 'alert-triangle' as IconName,
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/20',
    border: 'border-yellow-500/30',
  },
  'high': {
    iconName: 'alert-circle' as IconName,
    color: 'text-orange-400',
    bg: 'bg-orange-500/20',
    border: 'border-orange-500/30',
  },
  'very-high': {
    iconName: 'red-x' as IconName,
    color: 'text-red-400',
    bg: 'bg-red-500/20',
    border: 'border-red-500/30',
  },
} as const;

export default function RiskBadge({ riskLevel, riskScore, size = 'md', showTooltip = true }: RiskBadgeProps) {
  const { t } = useTranslation();
  if (!riskLevel && !riskScore) return null;

  // Determine risk level from score if not provided
  let level = riskLevel;
  if (!level && riskScore !== undefined) {
    if (riskScore < 30) level = 'low';
    else if (riskScore < 50) level = 'medium';
    else if (riskScore < 70) level = 'high';
    else level = 'very-high';
  }

  if (!level) return null;

  const labels: Record<string, string> = {
    'low': t('host.riskBadge.lowRisk', 'Low Risk'),
    'medium': t('host.riskBadge.mediumRisk', 'Medium Risk'),
    'high': t('host.riskBadge.highRisk', 'High Risk'),
    'very-high': t('host.riskBadge.veryHighRisk', 'Very High Risk'),
  };

  const recommendations: Record<string, string> = {
    'low': t('host.riskBadge.standardConfirmation', 'Standard confirmation'),
    'medium': t('host.riskBadge.sendReminder', 'Send reminder notification'),
    'high': t('host.riskBadge.callToConfirm', 'Call to confirm'),
    'very-high': t('host.riskBadge.requestDeposit', 'Request deposit or call'),
  };

  const config = RISK_STYLES[level];
  const label = labels[level];
  const recommendation = recommendations[level];

  const sizes = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5'
  };

  const badge = (
    <div
      className={`
        inline-flex items-center gap-1.5 rounded-full border
        ${config.bg} ${config.border} ${config.color}
        ${sizes[size]}
        font-medium whitespace-nowrap
        cursor-help
      `}
      title={showTooltip ? `${riskScore ? riskScore + '% ' : ''}${label} - ${recommendation}` : undefined}
    >
      <ThiingsIcon name={config.iconName} size="xs" />
      <span className="font-semibold">{label}</span>
      {riskScore !== undefined && size !== 'sm' && (
        <span className="opacity-75">({riskScore}%)</span>
      )}
    </div>
  );

  return badge;
}
