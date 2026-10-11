/**
 * Skeleton loading card matching VoiceCard layout dimensions.
 */

import { Skeleton } from '../common/Skeleton';

export default function VoiceCardSkeleton() {
  return (
    <div
      className="border-b border-brand-line px-3 py-4"
      aria-hidden="true"
    >
      {/* Name row */}
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-1">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-3 w-4" />
        </div>

        {/* Description lines */}
        <Skeleton className="h-3 w-full mb-1" />
        <Skeleton className="h-3 w-3/4" />
      </div>

      {/* Play button */}
      <Skeleton className="h-9 w-24 rounded-full" />
    </div>
  );
}
