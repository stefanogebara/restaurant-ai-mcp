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
      emoji: '✅',
      color: 'text-green-400',
      bg: 'bg-green-500/20',
      border: 'border-green-500/30',
      label: 'Low Risk',
      recommendation: 'Standard confirmation'
    },
    'medium': {
      emoji: '⚠️',
      color: 'text-yellow-400',
      bg: 'bg-yellow-500/20',
      border: 'border-yellow-500/30',
      label: 'Medium Risk',
      recommendation: 'Send reminder SMS'
    },
    'high': {
      emoji: '🔶',
      color: 'text-orange-400',
      bg: 'bg-orange-500/20',
      border: 'border-orange-500/30',
      label: 'High Risk',
      recommendation: 'Call to confirm'
    },
    'very-high': {
      emoji: '🔴',
      color: 'text-red-400',
      bg: 'bg-red-500/20',
      border: 'border-red-500/30',
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
      <span>{config.emoji}</span>
      <span className="font-semibold">{config.label}</span>
      {riskScore !== undefined && size !== 'sm' && (
        <span className="opacity-75">({riskScore}%)</span>
      )}
    </div>
  );

  return badge;
}
