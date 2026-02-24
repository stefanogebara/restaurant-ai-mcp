const statuses = [
  { label: 'Available', dotColor: 'bg-green-500' },
  { label: 'Occupied', dotColor: 'bg-burgundy' },
  { label: 'Being Cleaned', dotColor: 'bg-amber-500' },
  { label: 'Reserved', dotColor: 'bg-violet-600' },
];

export default function TableStatusLegend() {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="text-xs text-stone-gray font-medium">Status:</span>
      {statuses.map((status) => (
        <div key={status.label} className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${status.dotColor}`} />
          <span className="text-xs text-stone-gray">{status.label}</span>
        </div>
      ))}
    </div>
  );
}
