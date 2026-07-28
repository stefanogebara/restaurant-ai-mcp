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
import type { RestaurantSize } from '../types/profile.types';

/** Subset of /api/scrape-restaurant result we actually consume. */
export interface ScrapedRestaurant {
  name?: string | null;
  cuisine_type?: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  review_count?: number | null;
  price_level?: string | number | null;
  business_hours?: Record<string, { open_time: string | null; close_time: string | null; is_open: boolean }> | null;
}

/**
 * Estima porte e lugares a partir do que o Google já contou — para o passo de
 * mesas chegar PROPOSTO, não em branco.
 *
 * Plano zero-toque (28/jul): quem converte do demo nunca respondeu o
 * questionário de perfil, então `profile_data` está vazio e o Passo 3 abre
 * um salão em branco — o dono tem que DESENHAR as mesas. A semeadura
 * automática do Passo 3 já existe e já sabe distribuir mesas por porte
 * (calculateTableDistribution); o que falta é o porte. Esta função o infere:
 *
 * - nº de avaliações ≈ tráfego acumulado → porte (small/medium/large)
 * - faixa de preço ajusta os lugares: caro = salão mais espaçado (menos
 *   lugares), barato = mais rotativo e apertado (mais lugares)
 *
 * Calibração pelo caso real: Mocotó (18k avaliações, moderate) → large,
 * 90 lugares → ~20 mesas na distribuição large. Bate com o "15–25 mesas"
 * do plano. É uma PROPOSTA de partida — o dono ajusta números, não desenha.
 */
export function estimarPerfilPeloPorte(
  scraped: ScrapedRestaurant | null | undefined,
): { size: RestaurantSize; seat_count: number } | null {
  const avaliacoes = scraped?.review_count;
  if (typeof avaliacoes !== 'number' || avaliacoes <= 0) return null;

  const size: RestaurantSize = avaliacoes < 500 ? 'small' : avaliacoes < 5000 ? 'medium' : 'large';
  const lugaresBase: Record<RestaurantSize, number> = { small: 30, medium: 60, large: 90 };

  const porEnum: Record<string, number> = {
    PRICE_LEVEL_INEXPENSIVE: 1,
    PRICE_LEVEL_MODERATE: 2,
    PRICE_LEVEL_EXPENSIVE: 3,
    PRICE_LEVEL_VERY_EXPENSIVE: 4,
  };
  const nivel = typeof scraped?.price_level === 'number'
    ? scraped.price_level
    : porEnum[String(scraped?.price_level)] ?? 2;
  const fator = nivel >= 3 ? 0.8 : nivel === 1 ? 1.2 : 1.0;

  // Múltiplo de 5: "72 lugares" parece medição falsa; "70" parece proposta.
  const seat_count = Math.round((lugaresBase[size] * fator) / 5) * 5;
  return { size, seat_count };
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
