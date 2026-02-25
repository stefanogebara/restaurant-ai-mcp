import ThiingsIcon from '../common/ThiingsIcon';
import {
  getDiningStyleIcon,
  getDiningStyleColor,
  getSpontaneityColor,
  getSpontaneityLabel,
  type DNAStats,
} from './dnaHelpers';

interface DNAStatsBreakdownProps {
  stats: DNAStats;
}

export default function DNAStatsBreakdown({ stats }: DNAStatsBreakdownProps) {
  const totalDiningStyles = Object.values(stats.dining_styles).reduce((sum, c) => sum + c, 0);
  const totalDayTypes = Object.values(stats.day_type_preferences).reduce((sum, c) => sum + c, 0);
  const totalSpontaneity = Object.values(stats.spontaneity_distribution).reduce((sum, c) => sum + c, 0);

  return (
    <div className="space-y-4">
      {/* Dining Styles */}
      <div className="p-4 bg-soft-gray rounded-xl">
        <div className="flex items-center gap-2 mb-3">
          <ThiingsIcon name="users" pxSize={16} />
          <h3 className="text-sm font-semibold font-serif text-deep-charcoal">Dining Styles</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          {Object.entries(stats.dining_styles).map(([style, count]) => {
            const percentage = totalDiningStyles > 0 ? (count / totalDiningStyles) * 100 : 0;
            return (
              <div key={style} className={`p-3 rounded-xl border text-center ${getDiningStyleColor(style)}`}>
                <div className="flex justify-center mb-1">{getDiningStyleIcon(style)}</div>
                <div className="text-lg font-bold">{count}</div>
                <div className="text-xs capitalize">{style}</div>
                <div className="text-xs opacity-70">{percentage.toFixed(0)}%</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Day Type Preferences */}
      <div className="p-4 bg-soft-gray rounded-xl">
        <div className="flex items-center gap-2 mb-3">
          <ThiingsIcon name="calendar" pxSize={16} />
          <h3 className="text-sm font-semibold font-serif text-deep-charcoal">Day Preferences</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(stats.day_type_preferences).map(([dayType, count]) => {
            const percentage = totalDayTypes > 0 ? (count / totalDayTypes) * 100 : 0;
            const isWeekend = dayType === 'weekend';
            return (
              <div key={dayType} className={`p-3 rounded-xl border ${isWeekend ? 'bg-amber-600/10 border-amber-600/30' : 'bg-violet-600/10 border-violet-600/30'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {isWeekend ? <ThiingsIcon name="sun" pxSize={16} /> : <ThiingsIcon name="moon" pxSize={16} />}
                    <span className="text-sm font-medium text-deep-charcoal capitalize">{dayType}</span>
                  </div>
                  <span className="text-xl font-bold text-deep-charcoal">{count}</span>
                </div>
                <div className="w-full bg-white h-2 rounded-full overflow-hidden">
                  <div className={`h-full ${isWeekend ? 'bg-amber-600' : 'bg-violet-600'}`} style={{ width: `${percentage}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Time Slot Preferences */}
      <div className="p-4 bg-soft-gray rounded-xl">
        <div className="flex items-center gap-2 mb-3">
          <ThiingsIcon name="clock" pxSize={16} />
          <h3 className="text-sm font-semibold font-serif text-deep-charcoal">Time Slot Preferences</h3>
        </div>
        <div className="space-y-2">
          {Object.entries(stats.time_slot_preferences)
            .sort(([, a], [, b]) => b - a)
            .map(([timeSlot, count]) => {
              const totalTimeSlots = Object.values(stats.time_slot_preferences).reduce((sum, c) => sum + c, 0);
              const percentage = totalTimeSlots > 0 ? (count / totalTimeSlots) * 100 : 0;
              return (
                <div key={timeSlot} className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-deep-charcoal">{timeSlot}</span>
                      <span className="text-sm text-stone-gray">{count} ({percentage.toFixed(0)}%)</span>
                    </div>
                    <div className="w-full bg-white h-2 rounded-full overflow-hidden">
                      <div className="h-full bg-violet-600" style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Spontaneity Distribution */}
      <div className="p-4 bg-soft-gray rounded-xl">
        <div className="flex items-center gap-2 mb-3">
          <ThiingsIcon name="zap" pxSize={16} />
          <h3 className="text-sm font-semibold font-serif text-deep-charcoal">Booking Spontaneity</h3>
        </div>
        <div className="space-y-2">
          {Object.entries(stats.spontaneity_distribution)
            .sort(([, a], [, b]) => b - a)
            .map(([level, count]) => {
              const percentage = totalSpontaneity > 0 ? (count / totalSpontaneity) * 100 : 0;
              return (
                <div key={level} className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-deep-charcoal">{getSpontaneityLabel(level)}</span>
                      <span className="text-sm text-stone-gray">{count} ({percentage.toFixed(0)}%)</span>
                    </div>
                    <div className="w-full bg-white h-2 rounded-full overflow-hidden">
                      <div className={`h-full ${getSpontaneityColor(level)}`} style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
