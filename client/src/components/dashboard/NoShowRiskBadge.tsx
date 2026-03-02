interface NoShowRiskBadgeProps {
  riskScore?: number;  // 0-100
  riskLevel?: 'low' | 'medium' | 'high' | 'very-high';
}

const RISK_CONFIG = {
  low: { label: 'Low Risk', bg: 'bg-green-600/[8%]', text: 'text-green-600' },
  medium: { label: 'Medium Risk', bg: 'bg-amber-500/[8%]', text: 'text-amber-500' },
  high: { label: 'High Risk', bg: 'bg-red-600/[8%]', text: 'text-red-600' },
  'very-high': { label: 'Very High', bg: 'bg-red-700/[8%]', text: 'text-red-700' },
} as const;

function getRiskLevel(score: number): 'low' | 'medium' | 'high' | 'very-high' {
  if (score <= 20) return 'low';
  if (score <= 50) return 'medium';
  if (score <= 75) return 'high';
  return 'very-high';
}

export default function NoShowRiskBadge({ riskScore, riskLevel }: NoShowRiskBadgeProps) {
  if (riskScore === undefined && !riskLevel) return null;

  const level = riskLevel || getRiskLevel(riskScore ?? 0);
  const config = RISK_CONFIG[level] || RISK_CONFIG.low;

  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${config.bg} ${config.text}`}
      title={riskScore !== undefined ? `No-show probability: ${riskScore}%` : undefined}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
      {riskScore !== undefined ? `${riskScore}%` : config.label}
    </span>
  );
}
