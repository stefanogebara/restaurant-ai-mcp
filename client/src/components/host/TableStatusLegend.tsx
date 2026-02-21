import ThiingsIcon, { type IconName } from '../common/ThiingsIcon';

export default function TableStatusLegend() {
  const statuses: { iconName: IconName; label: string; iconBg: string; textColor: string }[] = [
    { iconName: 'check', label: 'Available', iconBg: 'bg-[#16a34a]', textColor: 'text-[#16a34a]' },
    { iconName: 'user', label: 'Occupied', iconBg: 'bg-burgundy', textColor: 'text-burgundy' },
    { iconName: 'sparkles', label: 'Being Cleaned', iconBg: 'bg-[#d97706]', textColor: 'text-[#d97706]' },
    { iconName: 'clock', label: 'Reserved', iconBg: 'bg-[#7c3aed]', textColor: 'text-[#7c3aed]' },
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
