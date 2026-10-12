import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface WaitlistTimeDisplayProps {
  addedAt: string;
  estimatedWait: number; // in minutes
  compact?: boolean;
}

export default function WaitlistTimeDisplay({ addedAt, estimatedWait, compact = false }: WaitlistTimeDisplayProps) {
  const { t } = useTranslation();
  const [now, setNow] = useState(new Date());

  // Update every minute
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const added = new Date(addedAt);
  const quotedMinutes = Math.max(1, estimatedWait);
  const elapsedMinutes = Math.max(0, Math.floor((now.getTime() - added.getTime()) / 60000));
  const remainingMinutes = Math.max(0, quotedMinutes - elapsedMinutes);
  const progress = Math.min((elapsedMinutes / quotedMinutes) * 100, 100);
  const isOverdue = elapsedMinutes > quotedMinutes;

  // Color based on progress
  const getProgressColor = () => {
    if (progress < 50) return 'bg-emerald-600';
    if (progress < 80) return 'bg-amber-600';
    return 'bg-red-600';
  };

  const getTextColor = () => {
    if (progress < 50) return 'text-emerald-700';
    if (progress < 80) return 'text-amber-600';
    return 'text-red-600';
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-border-gray rounded-full overflow-hidden">
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
        <div className="text-[10px] text-muted-stone uppercase tracking-wide">{t('waitlist.quotedTime')}</div>
        <div className="font-bold text-deep-charcoal text-sm">{estimatedWait}m</div>
      </div>

      {/* Progress Bar */}
      <div className="flex-1">
        <div className="h-2 bg-border-gray rounded-full overflow-hidden">
          <div
            className={`h-full ${getProgressColor()} transition-all duration-500`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-muted-stone">{t('waitlist.elapsedMinutes', { count: elapsedMinutes })}</span>
        </div>
      </div>

      {/* Remaining / Overdue */}
      <div className="text-center min-w-[60px]">
        <div className="text-[10px] text-muted-stone uppercase tracking-wide">
          {isOverdue ? t('waitlist.overdue') : t('waitlist.remaining')}
        </div>
        <div className={`font-bold text-sm ${getTextColor()}`}>
          {isOverdue ? `+${elapsedMinutes - estimatedWait}m` : `${remainingMinutes}m`}
        </div>
      </div>
    </div>
  );
}
