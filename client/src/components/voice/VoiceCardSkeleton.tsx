/**
 * Skeleton loading card matching VoiceCard layout dimensions.
 */

import { Skeleton } from '../common/Skeleton';

export default function VoiceCardSkeleton() {
  return (
    <div
      className="relative bg-white border-2 border-border-gray rounded-xl p-5"
      aria-hidden="true"
    >
      {/* Name row */}
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-1">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-3 w-4" />
        </div>

        {/* Tag badges */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          <Skeleton className="h-5 w-10 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>

        {/* Description lines */}
        <Skeleton className="h-3 w-full mb-1" />
        <Skeleton className="h-3 w-3/4" />
      </div>

      {/* Play button */}
      <Skeleton className="h-10 w-full rounded-lg" />
    </div>
  );
}
