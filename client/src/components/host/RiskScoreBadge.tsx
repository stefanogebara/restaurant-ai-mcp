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
          bg: 'bg-[#ef4444]/10 border-[#ef4444]/30',
          text: 'text-[#dc2626] dark:text-[#f87171]',
          iconName: 'alert-circle',
          label: 'Very High Risk'
        };
      case 'high':
        return {
          bg: 'bg-[#f97316]/10 border-[#f97316]/30',
          text: 'text-[#ea580c] dark:text-[#fb923c]',
          iconName: 'alert-triangle',
          label: 'High Risk'
        };
      case 'medium':
        return {
          bg: 'bg-[#eab308]/10 border-[#eab308]/30',
          text: 'text-[#ca8a04] dark:text-[#facc15]',
          iconName: 'info',
          label: 'Medium Risk'
        };
      case 'low':
        return {
          bg: 'bg-[#10b981]/10 border-[#10b981]/30',
          text: 'text-[#059669] dark:text-[#34d399]',
          iconName: 'shield-check',
          label: 'Low Risk'
        };
      default:
        return {
          bg: 'bg-warm-stone/10 border-warm-stone/30',
          text: 'text-stone-gray',
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
        <div className="text-xs text-warm-stone">
          {confidence}% confidence
        </div>
      )}
    </div>
  );
}
