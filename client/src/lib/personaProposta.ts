/**
 * Espelho de api/_lib/persona-proposta.js. Mantidos em sincronia por
 * client/src/lib/__tests__/personaProposta.sync.test.ts — o repositório já
 * tinha um espelho igual (vibeToPersonaPreset) com o comentário "keep both in
 * sync" e NENHUM guarda. Agora tem.
 */

export const FALA_DO_CLIENTE = {
  pt: 'Oi! Tem mesa pra 4 hoje às 20h?',
  es: '¡Hola! ¿Tienen mesa para 4 hoy a las 20h?',
  en: 'Hi! Any table for 4 tonight at 8?',
};

export const AMOSTRAS = {
  neighborhood: {
    rotulo: { pt: 'Do bairro', es: 'De barrio', en: 'Neighborhood' },
    resumo: {
      pt: 'Próxima, sem cerimônia. Trata quem chega como quem já é de casa.',
      es: 'Cercana, sin ceremonia. Trata a quien llega como de la casa.',
      en: 'Close and unfussy. Treats every guest like a regular.',
    },
    resposta: {
      pt: 'Oi! Às 20h tá cheio, mas às 21h eu consigo — e é uma hora boa, o salão fica mais tranquilo. Seguro pra você?',
      es: '¡Hola! A las 20h está lleno, pero a las 21h sí puedo — y es buena hora, el salón queda más tranquilo. ¿Te la guardo?',
      en: 'Hey! 8 is full, but I can do 9 — and it is a good time, the room quiets down. Want me to hold it?',
    },
  },
  fine_dining: {
    rotulo: { pt: 'Sóbria', es: 'Sobria', en: 'Refined' },
    resumo: {
      pt: 'Formal e discreta. Precisa, sem excesso de simpatia.',
      es: 'Formal y discreta. Precisa, sin exceso de simpatía.',
      en: 'Formal and discreet. Precise, never effusive.',
    },
    resposta: {
      pt: 'Boa tarde. Às 20h não temos disponibilidade. Posso oferecer 21h15 para quatro pessoas. Deseja que eu reserve?',
      es: 'Buenas tardes. A las 20h no tenemos disponibilidad. Puedo ofrecer 21h15 para cuatro personas. ¿Desea que reserve?',
      en: 'Good afternoon. We have no availability at 8. I can offer 9:15 for four. Shall I reserve it?',
    },
  },
  fast_efficient: {
    rotulo: { pt: 'Direta', es: 'Directa', en: 'Direct' },
    resumo: {
      pt: 'Rápida e clara. Resolve em duas linhas, sem rodeio.',
      es: 'Rápida y clara. Resuelve en dos líneas, sin rodeos.',
      en: 'Fast and clear. Two lines, no detours.',
    },
    resposta: {
      pt: 'Oi! 20h lotado. Tenho 19h15 ou 21h30, os dois pra 4. Qual prefere?',
      es: '¡Hola! 20h lleno. Tengo 19h15 o 21h30, ambos para 4. ¿Cuál prefieres?',
      en: 'Hi! 8 is booked. I have 7:15 or 9:30, both for 4. Which works?',
    },
  },
  family_friendly: {
    rotulo: { pt: 'Animada', es: 'Animada', en: 'Upbeat' },
    resumo: {
      pt: 'Calorosa e animada. Boa com grupo, criança e comemoração.',
      es: 'Cálida y animada. Buena con grupos, niños y celebraciones.',
      en: 'Warm and upbeat. Good with groups, kids and celebrations.',
    },
    resposta: {
      pt: 'Oi! Às 20h a casa tá cheia, mas às 19h eu tenho uma mesa ótima pra 4 — e dá tempo de vocês pegarem a sobremesa quentinha. Vamos nessa?',
      es: '¡Hola! A las 20h está llena, pero a las 19h tengo una mesa buenísima para 4 — y les da tiempo al postre recién hecho. ¿Vamos?',
      en: 'Hi! 8 is packed, but at 7 I have a great table for 4 — and you would still catch dessert fresh out. Shall we?',
    },
  },
};

export const ROTULO_TAG = {
  romantic:          { pt: 'romântico',        es: 'romántico',      en: 'romantic' },
  intimate:          { pt: 'intimista',        es: 'íntimo',         en: 'intimate' },
  upscale:           { pt: 'sofisticado',      es: 'sofisticado',    en: 'upscale' },
  quiet:             { pt: 'tranquilo',        es: 'tranquilo',      en: 'quiet' },
  traditional:       { pt: 'tradicional',      es: 'tradicional',    en: 'traditional' },
  casual:            { pt: 'descontraído',     es: 'informal',       en: 'casual' },
  lively:            { pt: 'animado',          es: 'animado',        en: 'lively' },
  bustling:          { pt: 'movimentado',      es: 'concurrido',     en: 'bustling' },
  trendy:            { pt: 'moderno',          es: 'moderno',        en: 'trendy' },
  'family-friendly': { pt: 'para famílias',    es: 'para familias',  en: 'family-friendly' },
  'family friendly': { pt: 'para famílias',    es: 'para familias',  en: 'family-friendly' },
  playful:           { pt: 'descontraído',     es: 'desenfadado',    en: 'playful' },
};

export const ORDEM_PADRAO = ['neighborhood', 'fast_efficient', 'family_friendly', 'fine_dining'] as const;

export type Preset = typeof ORDEM_PADRAO[number];
export type Idioma = 'pt' | 'es' | 'en';
