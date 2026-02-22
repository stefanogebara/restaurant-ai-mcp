import ThiingsIcon, { type IconName } from '../common/ThiingsIcon';

export default function TableStatusLegend() {
  const statuses: { iconName: IconName; label: string; iconBg: string; textColor: string }[] = [
    { iconName: 'check', label: 'Available', iconBg: 'bg-green-600', textColor: 'text-green-600' },
    { iconName: 'user', label: 'Occupied', iconBg: 'bg-burgundy', textColor: 'text-burgundy' },
    { iconName: 'sparkles', label: 'Being Cleaned', iconBg: 'bg-amber-600', textColor: 'text-amber-600' },
    { iconName: 'clock', label: 'Reserved', iconBg: 'bg-violet-600', textColor: 'text-violet-600' },
  ];

  return (
    <div className="flex items-center gap-3 text-sm flex-wrap">
      <span className="text-stone-gray font-medium">Status:</span>
      {statuses.map((status) => (
        <div
          key={status.label}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-border-gray shadow-sm"
        >
          <div className={`w-5 h-5 rounded ${status.iconBg} flex items-center justify-center`}>
            <ThiingsIcon name={status.iconName} size="xs" />
          </div>
          <span className={`font-medium ${status.textColor}`}>{status.label}</span>
        </div>
      ))}
    </div>
  );
}
