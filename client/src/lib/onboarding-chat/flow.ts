/**
 * The real onboarding chat flow. Replaces the 6-step form's data collection
 * with a sequenced conversation. Submission still hits the existing
 * /api/onboarding/complete endpoint via OnboardingChat.tsx; this file only
 * defines the conversational graph, not the network call.
 *
 * Design philosophy for v1:
 *   - Cover EVERY required OnboardingData field
 *   - Pre-fill sensible defaults for areas + booking settings (the form's
 *     defaults). Power-users tweak in /host-dashboard/settings later.
 *   - Keep the flow LINEAR (no branches yet) — adds complexity to A/B test
 *     edits in v2 once the baseline works.
 *   - All bot copy in English; pt-BR translation comes after the structure
 *     stabilises (cheaper than retranslating during design iteration).
 *
 * v2 will add: scraper prefill at start, multi-area conversations, hours
 * customization beyond "same every day", restaurant_type as click options.
 */

import { flowFromNodes } from './validateFlow';
import { END, type Node } from './flow.types';
import type { BusinessHours, RestaurantArea } from '../../types/onboarding.types';

// ─── default values mirrored from Onboarding.tsx buildDefaultData ──────────

const DEFAULT_HOURS: BusinessHours[] = [
  { day: 'Monday',    is_open: true, open_time: '12:00', close_time: '23:00' },
  { day: 'Tuesday',   is_open: true, open_time: '12:00', close_time: '23:00' },
  { day: 'Wednesday', is_open: true, open_time: '12:00', close_time: '23:00' },
  { day: 'Thursday',  is_open: true, open_time: '12:00', close_time: '23:00' },
  { day: 'Friday',    is_open: true, open_time: '12:00', close_time: '23:30' },
  { day: 'Saturday',  is_open: true, open_time: '12:00', close_time: '23:30' },
  { day: 'Sunday',    is_open: true, open_time: '12:00', close_time: '22:00' },
];

const DEFAULT_AREAS: RestaurantArea[] = [
  {
    name: 'Main',
    is_active: true,
    tables: [
      { capacity: 2, count: 2, shape: 'square', is_fixed_seating: false, is_joinable: true },
      { capacity: 4, count: 4, shape: 'square', is_fixed_seating: false, is_joinable: true },
      { capacity: 6, count: 2, shape: 'square', is_fixed_seating: false, is_joinable: true },
      { capacity: 8, count: 1, shape: 'square', is_fixed_seating: false, is_joinable: true },
    ],
  },
];

// ─── flow nodes ────────────────────────────────────────────────────────────

const nodes: Node[] = [
  {
    id: 'start',
    say: [
      "Hi! I'm here to set up your Seatable in about 5 minutes.",
      "We'll go step-by-step and you can correct anything I get wrong. Ready?",
    ],
    options: [{ id: 'go', label: "Let's go" }],
    branches: [{ when: { kind: 'always' }, next: 'ask-name' }],
  },

  // ── Step 1 equivalent: name, type, city, country ──────────────────────
  {
    id: 'ask-name',
    say: ["First, what's your restaurant called?"],
    input: {
      kind: 'text',
      placeholder: 'e.g. Cantina Bella',
      validate: (raw) => (raw.trim().length >= 2 ? null : 'Name is too short'),
    },
    writes: 'restaurant_name',
    branches: [{ when: { kind: 'always' }, next: 'ask-type' }],
  },
  {
    id: 'ask-type',
    say: ['Nice — {restaurant_name}. What kind of food do you serve?'],
    options: [
      { id: 'italian',   label: 'Italian',   value: 'Italian' },
      { id: 'japanese',  label: 'Japanese',  value: 'Japanese' },
      { id: 'brazilian', label: 'Brazilian', value: 'Brazilian' },
      { id: 'mexican',   label: 'Mexican',   value: 'Mexican' },
      { id: 'american',  label: 'American',  value: 'American' },
      { id: 'other',     label: 'Something else', value: 'Other' },
    ],
    writes: 'restaurant_type',
    branches: [{ when: { kind: 'always' }, next: 'ask-city' }],
  },
  {
    id: 'ask-city',
    say: ['Which city are you in?'],
    input: {
      kind: 'text',
      placeholder: 'e.g. São Paulo',
      validate: (raw) => (raw.trim().length >= 2 ? null : 'City name too short'),
    },
    writes: 'city',
    branches: [{ when: { kind: 'always' }, next: 'ask-country' }],
  },
  {
    id: 'ask-country',
    say: ['And the country?'],
    options: [
      { id: 'br', label: 'Brazil',         value: 'Brazil' },
      { id: 'pt', label: 'Portugal',       value: 'Portugal' },
      { id: 'es', label: 'Spain',          value: 'Spain' },
      { id: 'us', label: 'United States',  value: 'United States' },
      { id: 'gb', label: 'United Kingdom', value: 'United Kingdom' },
    ],
    writes: 'country',
    branches: [{ when: { kind: 'always' }, next: 'ask-phone' }],
  },

  // ── Step 2 equivalent: phone, email, hours, dining duration ──────────
  {
    id: 'ask-phone',
    say: ["What's the number guests can text you on (we'll handle replies via WhatsApp)?"],
    input: {
      kind: 'phone',
      placeholder: '+55 11 5555 1234',
      validate: (raw) => (/[\d]/.test(raw) && raw.replace(/\D/g, '').length >= 8 ? null : 'Please include a real number'),
    },
    writes: 'phone_number',
    branches: [{ when: { kind: 'always' }, next: 'ask-email' }],
  },
  {
    id: 'ask-email',
    say: ['And a reservation email guests can write to (or your own)?'],
    input: {
      kind: 'email',
      placeholder: 'reservations@your-restaurant.com',
      validate: (raw) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim()) ? null : 'That email looks off'),
    },
    writes: 'email',
    branches: [{ when: { kind: 'always' }, next: 'ask-hours' }],
  },
  {
    id: 'ask-hours',
    say: [
      "I'll start you with sensible hours and you can tweak in Settings later.",
      'Mon–Thu noon to 11pm, Fri–Sat noon to 11:30pm, Sun noon to 10pm. Sound right?',
    ],
    options: [
      { id: 'hours-ok',     label: 'Looks good',          value: DEFAULT_HOURS },
      { id: 'hours-closed-mon', label: 'Same but closed Mon', value: DEFAULT_HOURS.map((h) => h.day === 'Monday' ? { ...h, is_open: false } : h) },
    ],
    writes: 'business_hours',
    branches: [{ when: { kind: 'always' }, next: 'ask-duration' }],
  },
  {
    id: 'ask-duration',
    say: ['Roughly how long does the average guest stay?'],
    options: [
      { id: 'd60',  label: '1 hour',       value: 60 },
      { id: 'd90',  label: '1.5 hours',    value: 90 },
      { id: 'd120', label: '2 hours',      value: 120 },
      { id: 'd150', label: 'Longer — 2.5h', value: 150 },
    ],
    writes: 'average_dining_duration',
    branches: [{ when: { kind: 'always' }, next: 'confirm-tables' }],
  },

  // ── Step 3 equivalent: tables (defaults; multi-area lands in v2) ─────
  {
    id: 'confirm-tables',
    say: [
      "I'll start your floor with a Main area: 2 deuces, 4 four-tops, 2 six-tops, 1 eight-top.",
      'You can rename the area and add more in Settings → Floor Plan after we finish.',
    ],
    options: [
      { id: 'tables-ok', label: 'Sounds fine', value: DEFAULT_AREAS },
    ],
    writes: 'areas',
    branches: [{ when: { kind: 'always' }, next: 'ask-booking-policy' }],
  },

  // ── Step 4 equivalent: booking settings ──────────────────────────────
  {
    id: 'ask-booking-policy',
    say: ['How far ahead can guests book?'],
    options: [
      { id: 'b7',  label: '1 week',  value: 7 },
      { id: 'b14', label: '2 weeks', value: 14 },
      { id: 'b30', label: '1 month', value: 30 },
      { id: 'b60', label: '2 months', value: 60 },
    ],
    writes: 'advance_booking_days',
    branches: [{ when: { kind: 'always' }, next: 'ask-buffer' }],
  },
  {
    id: 'ask-buffer',
    say: ['Buffer time between bookings on the same table?'],
    options: [
      { id: 'b0',  label: 'None',     value: 0 },
      { id: 'b15', label: '15 min',   value: 15 },
      { id: 'b30', label: '30 min',   value: 30 },
    ],
    writes: 'buffer_time',
    branches: [{ when: { kind: 'always' }, next: 'ask-cancellation' }],
  },
  {
    id: 'ask-cancellation',
    say: ['And your cancellation policy?'],
    options: [
      { id: 'flex', label: 'Flexible — anytime',          value: 'Cancellations accepted anytime' },
      { id: '24h',  label: 'Reasonable — 24h notice',     value: '24 hours notice required for cancellations' },
      { id: '48h',  label: 'Strict — 48h notice',          value: '48 hours notice required for cancellations' },
    ],
    writes: 'cancellation_policy',
    branches: [{ when: { kind: 'always' }, next: 'review' }],
  },

  // ── Review ───────────────────────────────────────────────────────────
  {
    id: 'review',
    say: [
      "Quick recap before I create everything:",
      "• {restaurant_name} ({restaurant_type}) in {city}, {country}",
      "• Phone {phone_number} · Email {email}",
      "• Duration {average_dining_duration} min · Booking window {advance_booking_days} days · Buffer {buffer_time} min",
      'Look good?',
    ],
    options: [
      { id: 'submit', label: 'Create it!' },
      { id: 'restart', label: 'Start over' },
    ],
    branches: [
      { when: { kind: 'option_id', equals: 'restart' }, next: 'start' },
      { when: { kind: 'always' }, next: END },
    ],
  },
];

export const onboardingFlow = flowFromNodes(nodes);
