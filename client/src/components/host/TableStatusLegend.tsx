import { useTranslation } from 'react-i18next';

const statuses = [
  { key: 'available', dotColor: 'bg-green-500' },
  { key: 'occupied', dotColor: 'bg-burgundy' },
  { key: 'cleaning', dotColor: 'bg-amber-500' },
  { key: 'reserved', dotColor: 'bg-violet-600' },
] as const;

export default function TableStatusLegend() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="text-xs text-stone-gray font-medium">Status:</span>
      {statuses.map((status) => (
        <div key={status.key} className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${status.dotColor}`} />
          <span className="text-xs text-stone-gray">{t(`settings.tableStatus.${status.key}`)}</span>
        </div>
      ))}
    </div>
  );
}
