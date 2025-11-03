/**
 * ML Risk Score Badge Component
 *
 * Displays ML-predicted no-show risk level with color-coded badges
 */

import { AlertCircle, AlertTriangle, Info, ShieldCheck } from 'lucide-react';

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
  const getRiskStyle = () => {
    switch (riskLevel) {
      case 'very-high':
        return {
          bg: 'bg-red-500/10 border-red-500/30',
          text: 'text-red-600 dark:text-red-400',
          icon: AlertCircle,
          label: 'Very High Risk'
        };
      case 'high':
        return {
          bg: 'bg-orange-500/10 border-orange-500/30',
          text: 'text-orange-600 dark:text-orange-400',
          icon: AlertTriangle,
          label: 'High Risk'
        };
      case 'medium':
        return {
          bg: 'bg-yellow-500/10 border-yellow-500/30',
          text: 'text-yellow-600 dark:text-yellow-400',
          icon: Info,
          label: 'Medium Risk'
        };
      case 'low':
        return {
          bg: 'bg-emerald-500/10 border-emerald-500/30',
          text: 'text-emerald-600 dark:text-emerald-400',
          icon: ShieldCheck,
          label: 'Low Risk'
        };
      default:
        return {
          bg: 'bg-gray-500/10 border-gray-500/30',
          text: 'text-gray-600 dark:text-gray-400',
          icon: Info,
          label: 'Unknown'
        };
    }
  };

  const style = getRiskStyle();
  const Icon = style.icon;
  const classes = sizeClasses[size];

  return (
    <div className="flex flex-col gap-1">
      <div
        className={`inline-flex items-center ${classes.container} ${style.bg} ${style.text} border rounded-md font-medium`}
        title={`Risk Score: ${riskScore}% | Level: ${style.label}${confidence ? ` | Confidence: ${confidence}%` : ''}`}
      >
        <Icon className={classes.icon} />
        <span className="font-semibold">{Math.round(riskScore)}%</span>
      </div>

      {showConfidence && confidence && (
        <div className="text-xs text-muted-foreground">
          {confidence}% confidence
        </div>
      )}
    </div>
  );
}
