/**
 * Mapeamento demo → onboarding (extraído do Onboarding.tsx na G4).
 *
 * Por que virou função pura: o efeito de prefill morava dentro de um
 * componente de ~700 linhas e concentrava as duas corridas da auditoria
 * (clobberar rascunho retomado; vencer o que o dono está digitando) mais
 * quatro bugs de mapeamento — TODOS sem teste, porque testá-los exigia
 * montar a página inteira. Aqui cada regra é uma asserção de uma linha.
 *
 * Regra de ouro: o prefill preenche VAZIOS. Nunca sobrescreve o que já
 * existe no estado — nem valor digitado, nem rascunho restaurado.
 */
import type { OnboardingData } from '../types/onboarding.types';
import { toTileType } from './restaurantTypeSlug';
import { estimarPerfilPeloPorte } from './applyScrapedData';

/** Linha de restaurant_config devolvida por GET /api/demo/session. */
export interface DemoSessionRestaurant {
  restaurant_name?: string | null;
  restaurant_type?: string | null;
  city?: string | null;
  /** O demo grava CÓDIGO ISO aqui (não o nome do país). */
  country?: string | null;
  phone?: string | null;
  email?: string | null;
  business_hours?: Record<string, unknown> | null;
  scraped_data?: Record<string, unknown> | null;
}

export interface DemoPrefillResult {
  updates: Partial<OnboardingData>;
  /** Veio mais que o nome? Decide a copy do banner (G2.6). */
  substancial: boolean;
}

const DIAS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Placeholder que satisfaz o NOT NULL do demo — jamais um contato real. */
const DOMINIO_PLACEHOLDER = '@demo.seatable.one';

function nomeDoPais(iso: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(iso) || iso;
  } catch {
    return iso;
  }
}

/**
 * Converte o business_hours do demo para o formato do wizard.
 *
 * O demo grava `{ open_time, close_time, is_open }`; o mapper antigo lia
 * `.open`/`.close` (que não existem) e por isso TODO horário prefillado caía
 * nos defaults 12:00–23:00 em silêncio.
 */
export function converterHorarios(bh: Record<string, unknown>): OnboardingData['business_hours'] {
  return DIAS.map((day) => {
    const bruto = (bh[day] ?? bh[day.toLowerCase()]) as
      | string | { open_time?: string; close_time?: string; open?: string; close?: string; is_open?: boolean }
      | undefined;

    if (!bruto || bruto === 'Closed' || bruto === 'closed'
        || (typeof bruto === 'object' && bruto.is_open === false)) {
      return { day, is_open: false, open_time: '12:00', close_time: '23:00' };
    }
    if (typeof bruto === 'string') {
      const [abre, fecha] = bruto.split('-').map((x) => x.trim());
      return { day, is_open: true, open_time: abre || '12:00', close_time: fecha || '23:00' };
    }
    return {
      day,
      is_open: true,
      open_time: bruto.open_time || bruto.open || '12:00',
      close_time: bruto.close_time || bruto.close || '23:00',
    };
  });
}

export function mapDemoSessionToOnboarding(
  r: DemoSessionRestaurant,
  prev: Partial<OnboardingData>,
): DemoPrefillResult {
  const updates: Partial<OnboardingData> = {};

  if (r.restaurant_name && !prev.restaurant_name) updates.restaurant_name = r.restaurant_name;
  if (r.restaurant_type && !prev.restaurant_type) updates.restaurant_type = toTileType(r.restaurant_type);
  if (r.city && !prev.city) updates.city = r.city;

  // O Passo 1 valida `country_code` e o seletor de cidade é gateado nele.
  // Sem derivar os dois, o convert batia em "País é obrigatório" com o país
  // conhecido — e ao corrigir, perdia a cidade prefillada.
  if (r.country && /^[A-Za-z]{2}$/.test(r.country) && !prev.country_code) {
    const iso = r.country.toUpperCase();
    updates.country_code = iso;
    updates.country = nomeDoPais(iso);
  } else if (r.country && r.country !== 'Unknown' && !prev.country) {
    updates.country = r.country;
  }

  if (r.phone && !prev.phone_number) updates.phone_number = r.phone;
  if (r.email && !prev.email && !r.email.endsWith(DOMINIO_PLACEHOLDER)) {
    updates.email = r.email;
  }

  const scraped = r.scraped_data && typeof r.scraped_data === 'object'
    ? (r.scraped_data as Record<string, unknown>)
    : null;
  if (scraped) {
    const site = scraped.website;
    if (!updates.website && typeof site === 'string' && site) updates.website = site;

    // As tags de ambiente atravessam para a folha poder sugerir uma voz.
    // Não viram campo de formulário — só entram no cálculo da sugestão.
    const insights = scraped.insights;
    if (insights && typeof insights === 'object') {
      const tags = (insights as Record<string, unknown>).vibe_tags;
      if (Array.isArray(tags) && tags.length) {
        updates.vibe_tags = tags.filter((t): t is string => typeof t === 'string');
      }
    }

    const tel = scraped.phone;
    if (!updates.phone_number && typeof tel === 'string' && tel) updates.phone_number = tel;

    // Google Places é mais específico que o fallback 'Restaurant'; toTileType
    // traduz o texto livre para o vocabulário do wizard (sem isso a cozinha
    // real virava 'other' no banco).
    const cozinha = scraped.cuisine_type;
    if (typeof cozinha === 'string' && cozinha && !prev.restaurant_type
        && (!updates.restaurant_type || updates.restaurant_type === 'casual-dining')) {
      updates.restaurant_type = toTileType(cozinha);
    }

    // Porte estimado → o passo de mesas chega proposto. Questionário já
    // respondido pelo dono sempre vence a estimativa.
    if (!prev.profile_data?.seat_count) {
      const estimativa = estimarPerfilPeloPorte(scraped as never);
      if (estimativa) updates.profile_data = { ...prev.profile_data, ...estimativa };
    }
  }

  if (r.business_hours && typeof r.business_hours === 'object') {
    updates.business_hours = converterHorarios(r.business_hours);
  }

  // Banner honesto (G2.6): só afirma "dados do seu demo" quando veio mais que
  // o nome. Um convert do caminho "restaurante novo" chegava com um campo e o
  // mesmo banner triunfante.
  const camposUteis = Object.keys(updates).filter(
    (k) => k !== 'restaurant_name' && k !== 'profile_data',
  ).length;

  return { updates, substancial: camposUteis >= 2 };
}
