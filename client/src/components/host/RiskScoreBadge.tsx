/**
 * ML Risk Score Badge Component
 *
 * Displays ML-predicted no-show risk level with color-coded badges
 */

import ThiingsIcon, { type IconName } from '../common/ThiingsIcon';

interface RiskScoreBadgeProps {
  riskScore?: number;
  riskLevel?: 'low' | 'medium' | 'high' | 'very-high';
  confidence?: number;
  size?: 'small' | 'medium' | 'large';
  showConfidence?: boolean;
}

export default function RiskScoreBadge({
  riskScore,
  riskLevel,
  confidence,
  size = 'medium',
  showConfidence = false
}: RiskScoreBadgeProps) {
  // If no ML data, don't render anything
  if (!riskScore || !riskLevel) {
    return null;
  }

  // Size variants
  const sizeClasses = {
    small: {
      container: 'px-2 py-0.5 text-xs gap-1',
      icon: 'w-3 h-3',
      text: 'text-xs'
    },
    medium: {
      container: 'px-2.5 py-1 text-sm gap-1.5',
      icon: 'w-3.5 h-3.5',
      text: 'text-sm'
    },
    large: {
      container: 'px-3 py-1.5 text-base gap-2',
      icon: 'w-4 h-4',
      text: 'text-base'
    }
  };

  // Risk level styling
  const getRiskStyle = (): { bg: string; text: string; iconName: IconName; label: string } => {
    switch (riskLevel) {
      case 'very-high':
        return {
          bg: 'bg-red-500/10 border-red-500/30',
          text: 'text-red-600 dark:text-red-400',
          iconName: 'alert-circle',
          label: 'Very High Risk'
        };
      case 'high':
        return {
          bg: 'bg-orange-500/10 border-orange-500/30',
          text: 'text-orange-600 dark:text-orange-400',
          iconName: 'alert-triangle',
          label: 'High Risk'
        };
      case 'medium':
        return {
          bg: 'bg-yellow-500/10 border-yellow-500/30',
          text: 'text-yellow-600 dark:text-yellow-400',
          iconName: 'info',
          label: 'Medium Risk'
        };
      case 'low':
        return {
          bg: 'bg-emerald-500/10 border-emerald-500/30',
          text: 'text-emerald-600 dark:text-emerald-400',
          iconName: 'shield-check',
          label: 'Low Risk'
        };
      default:
        return {
          bg: 'bg-[#78716C]/10 border-[#78716C]/30',
          text: 'text-[#57534E]',
          iconName: 'info',
          label: 'Unknown'
        };
    }
  };

  const style = getRiskStyle();
  const classes = sizeClasses[size];

  return (
    <div className="flex flex-col gap-1">
      <div
        className={`inline-flex items-center ${classes.container} ${style.bg} ${style.text} border rounded-md font-medium`}
        title={`Risk Score: ${riskScore}% | Level: ${style.label}${confidence ? ` | Confidence: ${confidence}%` : ''}`}
      >
        <ThiingsIcon name={style.iconName} size="xs" />
        <span className="font-semibold">{Math.round(riskScore)}%</span>
      </div>

      {showConfidence && confidence && (
        <div className="text-xs text-[#78716C]">
          {confidence}% confidence
        </div>
      )}
    </div>
  );
}
