/**
 * Skeleton Loading Components
 *
 * Provides skeleton placeholders for better perceived performance
 * while content is loading.
 */

interface SkeletonProps {
  className?: string;
}

// Base skeleton with shimmer animation
export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-muted rounded ${className}`}
      aria-hidden="true"
    />
  );
}

// Skeleton for stat cards on dashboard
export function SkeletonStatCard() {
  return (
    <div className="bg-card rounded-xl p-4 border border-border" aria-hidden="true">
      <div className="flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-6 w-16" />
        </div>
      </div>
    </div>
  );
}

// Skeleton for reservation rows
export function SkeletonReservationRow() {
  return (
    <div className="p-4 border-b border-border" aria-hidden="true">
      <div className="flex items-center gap-4">
        <Skeleton className="w-12 h-12 rounded-full" />
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
    <div className="bg-card rounded-xl p-4 border border-border" aria-hidden="true">
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
    <div className="p-3 bg-muted/30 rounded-lg" aria-hidden="true">
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
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>

      {/* Table Grid */}
      <div className="bg-card rounded-lg p-6 border border-border">
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

export default Skeleton;
