'use strict';

/**
 * O enum `restaurant.restaurant_type` do Postgres, e como chegar nele.
 *
 * São dez valores, e o banco os impõe: gravar qualquer outra coisa é erro de
 * tipo, não valor ignorado. O que chega da vida real — "Pizzaria", "Comida
 * Japonesa", "Boteco", o `primaryType` do Google Places — não se parece com
 * nenhum deles, então alguém precisa traduzir.
 *
 * Esta função morava dentro de `api/demo/index.js`, um arquivo de handler,
 * onde nenhum outro código podia alcançá-la.
 */

const VALID_RESTAURANT_TYPES = Object.freeze([
  'fine_dining', 'casual_dining', 'fast_casual', 'cafe', 'bar',
  'steakhouse', 'italian', 'japanese', 'mexican', 'other',
]);

const SET_VALIDOS = new Set(VALID_RESTAURANT_TYPES);

/**
 * @param {string} cuisineType texto livre (cozinha, tipo do Places, o que for)
 * @returns {string} sempre um valor legal do enum
 */
function normalizeRestaurantType(cuisineType) {
  if (!cuisineType) return 'other';
  const lower = String(cuisineType).toLowerCase();
  if (SET_VALIDOS.has(lower)) return lower;

  // Português e espanhol vêm PRIMEIRO. O vocabulário original era inteiramente
  // inglês num produto cujo mercado principal é o Brasil: "Boteco do Zé" caía
  // em casual_dining porque não contém "bar", e "Pizzaria" não casava com
  // nada — não havia sequer uma regra para "pizza". Mesma família do sentinela
  // 'UTC' do #76: o caminho degradado é justamente a persona-alvo.
  if (/pizzari|pizzeri|\bpizza/.test(lower)) return 'italian';
  if (/cantina|trattoria|massa/.test(lower)) return 'italian';
  if (/churrascari|rodízio|rodizio|parrilla|espeto/.test(lower)) return 'steakhouse';
  if (/boteco|botequim|botec|cervejari|choperi|adega|taberna|pub/.test(lower)) return 'bar';
  if (/padari|confeitari|cafeteri|doceria|panaderia|pastelería/.test(lower)) return 'cafe';
  if (/lanchonete|hamburgueri|pastelaria|salgaderia/.test(lower)) return 'fast_casual';
  if (/temaker|izakaya|yakisoba|japones|japonês/.test(lower)) return 'japanese';
  if (/cantina mexicana|taqueri|taquería/.test(lower)) return 'mexican';

  if (lower.includes('italian')) return 'italian';
  if (lower.includes('japan') || lower.includes('sushi') || lower.includes('ramen')) return 'japanese';
  if (lower.includes('mexic') || lower.includes('taco') || lower.includes('burrito')) return 'mexican';
  if (lower.includes('steak') || lower.includes('grill') || lower.includes('bbq')) return 'steakhouse';
  if (lower.includes('cafe') || lower.includes('café') || lower.includes('coffee') || lower.includes('bakery')) return 'cafe';
  if (lower.includes('bar') || lower.includes('pub') || lower.includes('tavern')) return 'bar';
  if (lower.includes('fine') || lower.includes('gourmet') || lower.includes('upscale')) return 'fine_dining';
  if (lower.includes('fast') || lower.includes('quick')) return 'fast_casual';
  return 'casual_dining';
}

function isValidRestaurantType(v) {
  return typeof v === 'string' && SET_VALIDOS.has(v);
}

module.exports = { normalizeRestaurantType, isValidRestaurantType, VALID_RESTAURANT_TYPES };
