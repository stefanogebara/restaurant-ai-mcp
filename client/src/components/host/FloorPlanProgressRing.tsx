import { formatTime } from './floorPlanHelpers';
import type { PartyInfo } from './floorPlanHelpers';

interface ProgressRingProps {
  cx: number;
  cy: number;
  radius: number;
  party: PartyInfo;
}

export default function FloorPlanProgressRing({ cx, cy, radius, party }: ProgressRingProps) {
  const total = party.timeElapsed + party.timeRemaining;
  const progress = party.isOverdue ? 1 : (total > 0 ? Math.min(party.timeElapsed / total, 1) : 0);
  const circ = 2 * Math.PI * radius;
  const offset = circ * (1 - progress);

  let ringColor = '#9F1239';
  if (party.isOverdue) ringColor = '#E11D48';
  else if (progress > 0.75) ringColor = '#D97706';
  else if (progress > 0.5)  ringColor = '#F59E0B';

  return (
    <g>
      <circle cx={cx} cy={cy} r={radius} fill="none"
        stroke={ringColor} strokeWidth={2} opacity={0.12} />
      <circle cx={cx} cy={cy} r={radius} fill="none"
        stroke={ringColor} strokeWidth={2} opacity={0.6}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy - radius - 5} textAnchor="middle"
        fontSize={9} fontWeight={600} fill={ringColor}
        fontFamily="Inter,-apple-system,sans-serif">
        {party.isOverdue
          ? `+${formatTime(Math.abs(party.timeRemaining))} over`
          : formatTime(party.timeElapsed)}
      </text>
    </g>
  );
}
