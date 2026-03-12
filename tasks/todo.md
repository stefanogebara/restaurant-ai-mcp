# Sprint 1: 12A-1 Google Maps Scraper + 12A-2 Kill Demo Data Wall

## Goal
Reduce demo setup from 11-field form to 3 fields (restaurant name, city, email).
Auto-scrape restaurant data from Google Places API. Land directly in pre-populated dashboard.

## Tasks

### 12A-1: Google Maps Auto-Scraper API
- [x] Create `api/scrape-restaurant.js` — POST endpoint, accepts `{query, city, country?}`
- [x] Returns: name, address, phone, hours, cuisine, rating, review_count, top_reviews, website, google_maps_url
- [x] Rate-limited (5/min per IP), no auth required (public demo flow)
- [x] Reuses existing `fetchGooglePlacesData` pattern from restaurantIntelligence.js
- [x] Add phone number extraction (internationalPhoneNumber + nationalPhoneNumber)
- [x] Cuisine inference from Google Places types (20+ mappings)
- [x] Business hours parsing (periods → our JSONB format)
- [x] 8 unit tests passing

### 12A-2: Kill Demo Data Wall
- [x] Simplify `DemoSetupForm.tsx` — 3 fields: restaurant name, city, email (was 11)
- [x] Add "Find it" search button that calls scrape endpoint
- [x] Show scraped data preview card (rating, address, hours, cuisine, reviews)
- [x] Multi-result selection (up to 3 results)
- [x] "Not listed? Continue manually" fallback
- [x] Modify `api/demo.js` handleCreate — accept `scraped_data` object, auto-fill config
- [x] Auto-derive: cuisine_type, business_hours, phone, website from scraped data
- [x] Update `DemoSetupPage.tsx` with new 2-step flow (search → confirm → dashboard)
- [x] TypeScript clean (tsc --noEmit passes)
- [x] All 1393 backend + 392 frontend tests pass
- [x] Demo-specific tests (9/9) still pass

### Remaining
- [ ] Verify on production after deploy (manual test)
