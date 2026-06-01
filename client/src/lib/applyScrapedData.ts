/**
 * Pure converter from /api/scrape-restaurant response shape into the
 * Partial<OnboardingData> our onboarding wizard expects. Used by:
 *
 *   1. Step0Search — when the user picks the top Google Places hit
 *   2. Onboarding.tsx demo-prefill — when a demo signup converts and we
 *      already have scraped_data on the restaurant row
 *
 * Centralising this keeps the two callers from drifting and gives us one
 * place to update when the scraper's response shape evolves.
 *
 * The scraper's response shape (see api/scrape-restaurant.js):
 *   {
 *     name, address, phone, rating, review_count, price_level, cuisine_type,
 *     website, google_maps_url, editorial_summary,
 *     business_hours: {                 // keyed object
 *       monday:    { open_time, close_time, is_open },
 *       tuesday:   ...,
 *       ...
 *     },
 *     hours_text, top_reviews, types, photo_ref
 *   }
 *
 * Onboarding's OnboardingData wants business_hours as an Array<BusinessHours>
 * with capitalised day names and the same { open_time, close_time, is_open }
 * record shape — see client/src/types/onboarding.types.ts.
 */

import type { BusinessHours, OnboardingData } from '../types/onboarding.types';

/** Subset of /api/scrape-restaurant result we actually consume. */
export interface ScrapedRestaurant {
  name?: string | null;
  cuisine_type?: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  business_hours?: Record<string, { open_time: string | null; close_time: string | null; is_open: boolean }> | null;
}

const DAYS_ORDERED = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

/**
 * Build a Partial<OnboardingData> from a scrape result. Only fields the
 * scraper actually populated are returned — callers spread this onto
 * existing OnboardingData with `{ ...prev, ...applyScrapedData(s) }` so
 * user-edited values aren't clobbered by null scraper hits.
 */
export function applyScrapedData(scraped: ScrapedRestaurant | null | undefined): Partial<OnboardingData> {
  if (!scraped) return {};

  const updates: Partial<OnboardingData> = {};

  if (scraped.name) {
    updates.restaurant_name = scraped.name;
  }
  if (scraped.cuisine_type) {
    updates.restaurant_type = scraped.cuisine_type;
  }
  if (scraped.phone) {
    updates.phone_number = scraped.phone;
  }
  if (scraped.website) {
    updates.website = scraped.website;
  }
  if (scraped.business_hours && typeof scraped.business_hours === 'object') {
    updates.business_hours = convertHours(scraped.business_hours);
  }

  return updates;
}

function convertHours(
  scrapedHours: Record<string, { open_time: string | null; close_time: string | null; is_open: boolean }>,
): BusinessHours[] {
  return DAYS_ORDERED.map((day): BusinessHours => {
    // Scraper returns lowercase keys; tolerate any casing the caller hands us.
    const lookup = scrapedHours[day] ?? scrapedHours[day.toLowerCase()] ?? null;
    if (!lookup || lookup.is_open === false || !lookup.open_time || !lookup.close_time) {
      return { day, is_open: false, open_time: '12:00', close_time: '23:00' };
    }
    return {
      day,
      is_open: true,
      open_time: lookup.open_time,
      close_time: lookup.close_time,
    };
  });
}
