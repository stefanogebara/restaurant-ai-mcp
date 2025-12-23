// SVG Icon Components
const CheckIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
  </svg>
);

const PersonIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
  </svg>
);

const SparklesIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 20 20" fill="currentColor">
    <path d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 01-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1zM12 2a1 1 0 01.967.744L14.146 7.2 17.5 9.134a1 1 0 010 1.732l-3.354 1.935-1.18 4.455a1 1 0 01-1.933 0L9.854 12.8 6.5 10.866a1 1 0 010-1.732l3.354-1.935 1.18-4.455A1 1 0 0112 2z" />
  </svg>
);

const ClockIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
  </svg>
);

export default function TableStatusLegend() {
  const statuses = [
    { Icon: CheckIcon, label: 'Available', iconBg: 'bg-[#16a34a]', textColor: 'text-[#16a34a]' },
    { Icon: PersonIcon, label: 'Occupied', iconBg: 'bg-[#9F1239]', textColor: 'text-[#9F1239]' },
    { Icon: SparklesIcon, label: 'Being Cleaned', iconBg: 'bg-[#d97706]', textColor: 'text-[#d97706]' },
    { Icon: ClockIcon, label: 'Reserved', iconBg: 'bg-[#7c3aed]', textColor: 'text-[#7c3aed]' },
  ];

  return (
    <div className="flex items-center gap-3 text-sm flex-wrap">
      <span className="text-[#57534E] font-medium">Status:</span>
      {statuses.map((status) => (
        <div
          key={status.label}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-[#E7E5E4] shadow-sm"
        >
          <div className={`w-5 h-5 rounded ${status.iconBg} flex items-center justify-center`}>
            <status.Icon className="w-3 h-3 text-white" />
          </div>
          <span className={`font-medium ${status.textColor}`}>{status.label}</span>
        </div>
      ))}
    </div>
  );
}
