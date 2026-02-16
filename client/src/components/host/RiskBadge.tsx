import ThiingsIcon, { type IconName } from '../common/ThiingsIcon';

interface RiskBadgeProps {
  riskLevel?: 'low' | 'medium' | 'high' | 'very-high';
  riskScore?: number;
  size?: 'sm' | 'md' | 'lg';
  showTooltip?: boolean;
}

export default function RiskBadge({ riskLevel, riskScore, size = 'md', showTooltip = true }: RiskBadgeProps) {
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

  const configs = {
    'low': {
      iconName: 'green-check' as IconName,
      color: 'text-[#4ade80]',
      bg: 'bg-[#22c55e]/20',
      border: 'border-[#22c55e]/30',
      label: 'Low Risk',
      recommendation: 'Standard confirmation'
    },
    'medium': {
      iconName: 'alert-triangle' as IconName,
      color: 'text-[#facc15]',
      bg: 'bg-[#eab308]/20',
      border: 'border-[#eab308]/30',
      label: 'Medium Risk',
      recommendation: 'Send reminder notification'
    },
    'high': {
      iconName: 'alert-circle' as IconName,
      color: 'text-[#fb923c]',
      bg: 'bg-[#f97316]/20',
      border: 'border-[#f97316]/30',
      label: 'High Risk',
      recommendation: 'Call to confirm'
    },
    'very-high': {
      iconName: 'red-x' as IconName,
      color: 'text-[#f87171]',
      bg: 'bg-[#ef4444]/20',
      border: 'border-[#ef4444]/30',
      label: 'Very High Risk',
      recommendation: 'Request deposit or call'
    }
  };

  const config = configs[level];

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
      title={showTooltip ? `${riskScore ? riskScore + '% ' : ''}${config.label} - ${config.recommendation}` : undefined}
    >
      <ThiingsIcon name={config.iconName} size="xs" />
      <span className="font-semibold">{config.label}</span>
      {riskScore !== undefined && size !== 'sm' && (
        <span className="opacity-75">({riskScore}%)</span>
      )}
    </div>
  );

  return badge;
}
