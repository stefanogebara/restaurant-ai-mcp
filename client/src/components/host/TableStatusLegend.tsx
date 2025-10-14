export default function TableStatusLegend() {
  const statuses = [
    { icon: '✅', label: 'Available', color: 'text-emerald-400 bg-emerald-500/10' },
    { icon: '🔴', label: 'Occupied', color: 'text-red-400 bg-red-500/10' },
    { icon: '🧹', label: 'Being Cleaned', color: 'text-yellow-400 bg-yellow-500/10' },
    { icon: '🔵', label: 'Reserved', color: 'text-blue-400 bg-blue-500/10' },
  ];

  return (
    <div className="flex items-center gap-4 text-sm">
      <span className="text-gray-400 font-medium">Status:</span>
      {statuses.map((status) => (
        <div
          key={status.label}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${status.color} transition-all hover:scale-105`}
        >
          <span className="text-base">{status.icon}</span>
          <span className={`font-medium ${status.color.split(' ')[0]}`}>{status.label}</span>
        </div>
      ))}
    </div>
  );
}
