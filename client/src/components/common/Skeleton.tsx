/**
 * Skeleton Loading Components
 *
 * Provides skeleton placeholders for better perceived performance
 * while content is loading. Styled to match the premium stone palette.
 */

interface SkeletonProps {
  className?: string;
}

// Base skeleton with shimmer animation
export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-border-gray rounded ${className}`}
      aria-hidden="true"
    />
  );
}

// Skeleton for stat cards — matches premium accent bar pattern
export function SkeletonStatCard() {
  return (
    <div className="bg-white rounded-xl p-4 border border-border-gray/50 shadow-sm" aria-hidden="true">
      <Skeleton className="h-1 w-12 rounded-full mb-3" />
      <Skeleton className="h-8 w-16 mb-1" />
      <Skeleton className="h-3 w-20 mt-1" />
    </div>
  );
}

// Skeleton for reservation rows
export function SkeletonReservationRow() {
  return (
    <div className="p-4 border-b border-border-gray/50" aria-hidden="true">
      <div className="flex items-center gap-4">
        <Skeleton className="w-9 h-9 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-8 w-20 rounded-lg" />
      </div>
    </div>
  );
}

// Skeleton for table cards in grid
export function SkeletonTableCard() {
  return (
    <div className="bg-white rounded-xl p-4 border border-border-gray/50 shadow-sm" aria-hidden="true">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="w-10 h-10 rounded-lg" />
          <Skeleton className="h-8 w-8" />
        </div>
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
    </div>
  );
}

// Skeleton for active party items
export function SkeletonActiveParty() {
  return (
    <div className="p-3 bg-soft-gray/30 rounded-lg" aria-hidden="true">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-8 w-16 rounded-lg" />
      </div>
    </div>
  );
}

// Full dashboard loading skeleton
export function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-label="Loading dashboard..." role="status">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>

      {/* Table Grid */}
      <div className="bg-white rounded-xl p-6 border border-border-gray/50 shadow-sm">
        <Skeleton className="h-6 w-32 mb-4" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <SkeletonTableCard key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

// Skeleton for analytics dashboard: header + stats + chart grid
export function SkeletonAnalytics() {
  return (
    <div className="min-h-screen bg-warm-white" aria-label="Loading analytics..." role="status">
      {/* Header */}
      <div className="bg-white border-b border-border-gray/50 px-6 py-5">
        <div className="max-w-[1600px] mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
          <div className="flex gap-3">
            <Skeleton className="h-10 w-24 rounded-lg" />
            <Skeleton className="h-10 w-36 rounded-lg" />
          </div>
        </div>
      </div>
      {/* Stats row */}
      <div className="max-w-[1600px] mx-auto px-6 py-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonStatCard key={i} />
          ))}
        </div>
      </div>
      {/* Chart grid */}
      <div className="max-w-[1600px] mx-auto px-6 pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="lg:col-span-2 bg-white rounded-xl border border-border-gray/50 shadow-sm p-6">
            <Skeleton className="h-5 w-40 mb-4" />
            <Skeleton className="h-48 w-full rounded" />
          </div>
          <div className="bg-white rounded-xl border border-border-gray/50 shadow-sm p-6">
            <Skeleton className="h-5 w-32 mb-4" />
            <Skeleton className="h-40 w-full rounded" />
          </div>
          <div className="bg-white rounded-xl border border-border-gray/50 shadow-sm p-6">
            <Skeleton className="h-5 w-32 mb-4" />
            <Skeleton className="h-40 w-full rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}

// Skeleton for table config: header + stat cards + table card grid
export function SkeletonTableConfig() {
  return (
    <div className="min-h-screen bg-warm-white" aria-label="Loading tables..." role="status">
      <header className="bg-white/80 backdrop-blur-sm border-b border-border-gray sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="space-y-2">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
            <div className="flex gap-3">
              <Skeleton className="h-10 w-28 rounded-lg" />
              <Skeleton className="h-10 w-32 rounded-lg" />
            </div>
          </div>
        </div>
      </header>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonStatCard key={i} />
          ))}
        </div>
        {/* Table cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-border-gray/50 shadow-sm p-5 space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-32" />
              <div className="flex gap-2 pt-2">
                <Skeleton className="h-8 w-16 rounded-lg" />
                <Skeleton className="h-8 w-16 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Skeleton for call tracking: stats + conversation list
export function SkeletonCallTracking() {
  return (
    <div className="space-y-6 p-6" aria-label="Loading call data..." role="status">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-10 w-24 rounded-xl" />
      </div>
      {/* Phone status card */}
      <div className="bg-white rounded-xl border border-border-gray/50 shadow-sm p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <Skeleton className="w-6 h-6 rounded" />
            <div className="space-y-1">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
          <Skeleton className="h-7 w-20 rounded-full" />
        </div>
      </div>
      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>
      {/* Conversation list */}
      <div className="bg-white rounded-xl border border-border-gray/50 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border-gray/50 flex items-center justify-between">
          <Skeleton className="h-6 w-36" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-24 rounded-lg" />
            <Skeleton className="h-8 w-24 rounded-lg" />
          </div>
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="p-4 border-b border-border-gray/50 flex items-center gap-4">
            <Skeleton className="w-9 h-9 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

// Skeleton for subscription management page
export function SkeletonSubscription() {
  return (
    <div className="min-h-screen bg-warm-white" aria-label="Loading subscription..." role="status">
      <div className="max-w-4xl mx-auto px-6 py-12 space-y-8">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        {/* Plan card */}
        <div className="bg-white rounded-2xl border border-border-gray/50 shadow-sm p-8 space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-8 w-24" />
            </div>
            <Skeleton className="h-10 w-28 rounded-lg" />
          </div>
          <div className="border-t border-border-gray/50 pt-6">
            <Skeleton className="h-5 w-24 mb-4" />
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-44" />
              ))}
            </div>
          </div>
        </div>
        {/* Usage section */}
        <div className="bg-white rounded-2xl border border-border-gray/50 shadow-sm p-8 space-y-4">
          <Skeleton className="h-6 w-28" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Skeleton for weekly report page
export function SkeletonWeeklyReport() {
  return (
    <div className="space-y-6" aria-label="Loading report..." role="status">
      {/* Date range selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-32 rounded-xl" />
          <Skeleton className="h-10 w-32 rounded-xl" />
        </div>
      </div>
      {/* Metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>
      {/* Chart sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-border-gray/50 shadow-sm p-6">
          <Skeleton className="h-5 w-32 mb-4" />
          <Skeleton className="h-40 w-full rounded" />
        </div>
        <div className="bg-white rounded-xl border border-border-gray/50 shadow-sm p-6">
          <Skeleton className="h-5 w-32 mb-4" />
          <Skeleton className="h-40 w-full rounded" />
        </div>
      </div>
    </div>
  );
}

export default Skeleton;
