/**
 * Special bot bubble that renders scraped restaurant data so the user can
 * eyeball what we found before confirming. Mirrors the chat bubble visual
 * language (left-aligned, white card, border-gray border) but with richer
 * content + an "edit" link slot.
 *
 * Pure presentational. The "edit" action is wired by the parent.
 */
import type { ScrapedRestaurant } from '../../lib/applyScrapedData';

export interface RestaurantCardProps {
  data: ScrapedRestaurant & {
    rating?: number | null;
    review_count?: number | null;
    photo_ref?: string | null;
  };
  onEdit?: () => void;
}

export default function RestaurantCard({ data, onEdit }: RestaurantCardProps) {
  return (
    <div className="w-full flex justify-start">
      <div
        className="max-w-[80%] glass-panel rounded-bl-sm overflow-hidden"
        data-testid="onboarding-chat-restaurant-card"
      >
        <div className="p-4 space-y-2">
          <p className="text-base font-semibold text-deep-charcoal">{data.name || 'Unknown'}</p>
          {data.address && (
            <p className="text-xs text-muted-stone">ðŸ“ {data.address}</p>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-stone">
            {data.cuisine_type && <span>{data.cuisine_type}</span>}
            {typeof data.rating === 'number' && (
              <span>â­ {data.rating} {data.review_count ? `(${data.review_count})` : null}</span>
            )}
            {data.phone && <span>ðŸ“ž {data.phone}</span>}
          </div>
        </div>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="w-full text-left px-4 py-2 border-t border-glass-border-dark text-xs text-burgundy hover:bg-warm-white transition-colors"
            data-testid="onboarding-chat-restaurant-card-edit"
          >
            Edit
          </button>
        )}
      </div>
    </div>
  );
}
