import { useState, useEffect } from 'react';

interface WaitlistTimeDisplayProps {
  addedAt: string;
  estimatedWait: number; // in minutes
  compact?: boolean;
}

export default function WaitlistTimeDisplay({ addedAt, estimatedWait, compact = false }: WaitlistTimeDisplayProps) {
  const [now, setNow] = useState(new Date());

  // Update every minute
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const added = new Date(addedAt);
  const elapsedMinutes = Math.floor((now.getTime() - added.getTime()) / 60000);
  const remainingMinutes = Math.max(0, estimatedWait - elapsedMinutes);
  const progress = Math.min((elapsedMinutes / estimatedWait) * 100, 100);
  const isOverdue = elapsedMinutes > estimatedWait;

  // Color based on progress
  const getProgressColor = () => {
    if (progress < 50) return 'bg-[#16a34a]';
    if (progress < 80) return 'bg-[#d97706]';
    return 'bg-[#dc2626]';
  };

  const getTextColor = () => {
    if (progress < 50) return 'text-[#16a34a]';
    if (progress < 80) return 'text-[#d97706]';
    return 'text-[#dc2626]';
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-[#E7E5E4] rounded-full overflow-hidden">
          <div
            className={`h-full ${getProgressColor()} transition-all duration-500`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className={`text-xs font-medium ${getTextColor()}`}>
          {isOverdue ? `+${elapsedMinutes - estimatedWait}m` : `${remainingMinutes}m`}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      {/* Quoted Time */}
      <div className="text-center min-w-[50px]">
        <div className="text-[10px] text-[#A8A29E] uppercase tracking-wide">Quoted</div>
        <div className="font-bold text-[#1C1917] text-sm">{estimatedWait}m</div>
      </div>

      {/* Progress Bar */}
      <div className="flex-1">
        <div className="h-2 bg-[#E7E5E4] rounded-full overflow-hidden">
          <div
            className={`h-full ${getProgressColor()} transition-all duration-500`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-[#A8A29E]">{elapsedMinutes}m elapsed</span>
        </div>
      </div>

      {/* Remaining / Overdue */}
      <div className="text-center min-w-[60px]">
        <div className="text-[10px] text-[#A8A29E] uppercase tracking-wide">
          {isOverdue ? 'Overdue' : 'Remaining'}
        </div>
        <div className={`font-bold text-sm ${getTextColor()}`}>
          {isOverdue ? `+${elapsedMinutes - estimatedWait}m` : `${remainingMinutes}m`}
        </div>
      </div>
    </div>
  );
}
