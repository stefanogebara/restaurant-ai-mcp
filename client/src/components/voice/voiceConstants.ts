/**
 * Supported languages and preview text templates for voice selection.
 */

export interface SupportedLanguage {
  code: string;
  label: string;
  flag: string;
}

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'es', label: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', label: 'French', flag: '🇫🇷' },
  { code: 'de', label: 'German', flag: '🇩🇪' },
  { code: 'it', label: 'Italian', flag: '🇮🇹' },
  { code: 'pt', label: 'Portuguese', flag: '🇵🇹' },
  { code: 'nl', label: 'Dutch', flag: '🇳🇱' },
  { code: 'pl', label: 'Polish', flag: '🇵🇱' },
  { code: 'sv', label: 'Swedish', flag: '🇸🇪' },
  { code: 'tr', label: 'Turkish', flag: '🇹🇷' },
  { code: 'ja', label: 'Japanese', flag: '🇯🇵' },
  { code: 'ko', label: 'Korean', flag: '🇰🇷' },
  { code: 'zh', label: 'Chinese', flag: '🇨🇳' },
  { code: 'ru', label: 'Russian', flag: '🇷🇺' },
  { code: 'hi', label: 'Hindi', flag: '🇮🇳' },
];

const PREVIEW_TEMPLATES: Record<string, (name: string) => string> = {
  en: (name) => `Welcome to ${name}! I'd be happy to help you make a reservation today.`,
  es: (name) => `¡Bienvenido a ${name}! Estaré encantado de ayudarle a hacer una reserva hoy.`,
  fr: (name) => `Bienvenue chez ${name} ! Je serais ravi de vous aider à réserver aujourd'hui.`,
  de: (name) => `Willkommen bei ${name}! Ich helfe Ihnen gerne, heute einen Tisch zu reservieren.`,
  it: (name) => `Benvenuto da ${name}! Sarò felice di aiutarti a prenotare oggi.`,
  pt: (name) => `Bem-vindo ao ${name}! Terei prazer em ajudá-lo a fazer uma reserva hoje.`,
  nl: (name) => `Welkom bij ${name}! Ik help u graag vandaag nog een reservering te maken.`,
  pl: (name) => `Witamy w ${name}! Chętnie pomogę Ci dokonać rezerwacji dzisiaj.`,
  sv: (name) => `Välkommen till ${name}! Jag hjälper dig gärna att boka bord idag.`,
  tr: (name) => `${name}'a hoş geldiniz! Bugün rezervasyon yapmanıza yardımcı olmaktan mutluluk duyarım.`,
  ja: (name) => `${name}へようこそ！本日のご予約をお手伝いさせていただきます。`,
  ko: (name) => `${name}에 오신 것을 환영합니다! 오늘 예약을 도와드리겠습니다.`,
  zh: (name) => `欢迎光临${name}！我很乐意帮您预订今天的座位。`,
  ru: (name) => `Добро пожаловать в ${name}! Я буду рад помочь вам сделать бронирование сегодня.`,
  hi: (name) => `${name} में आपका स्वागत है! मैं आज आपको आरक्षण करने में मदद करने में खुश हूं।`,
};

/**
 * Get a personalized preview text in the given language.
 * Falls back to English if language is not supported.
 */
export function getPreviewText(language: string, restaurantName?: string): string {
  const name = restaurantName || 'our restaurant';
  const baseLang = language.split('-')[0];
  const template = PREVIEW_TEMPLATES[baseLang] || PREVIEW_TEMPLATES['en'];
  return template(name);
}

/**
 * Map a country name to a default language code.
 */
const COUNTRY_TO_LANGUAGE: Record<string, string> = {
  'United States': 'en', 'USA': 'en', 'US': 'en',
  'United Kingdom': 'en', 'UK': 'en', 'England': 'en',
  'Canada': 'en', 'Australia': 'en', 'Ireland': 'en', 'New Zealand': 'en',
  'Spain': 'es', 'España': 'es',
  'Mexico': 'es', 'México': 'es', 'Argentina': 'es', 'Colombia': 'es',
  'Chile': 'es', 'Peru': 'es', 'Perú': 'es', 'Venezuela': 'es',
  'Ecuador': 'es', 'Guatemala': 'es', 'Cuba': 'es', 'Bolivia': 'es',
  'Dominican Republic': 'es', 'Honduras': 'es', 'Paraguay': 'es',
  'El Salvador': 'es', 'Nicaragua': 'es', 'Costa Rica': 'es',
  'Panama': 'es', 'Panamá': 'es', 'Uruguay': 'es', 'Puerto Rico': 'es',
  'France': 'fr', 'Belgium': 'fr', 'Switzerland': 'fr', 'Monaco': 'fr', 'Luxembourg': 'fr',
  'Germany': 'de', 'Austria': 'de',
  'Italy': 'it',
  'Portugal': 'pt', 'Brazil': 'pt',
  'China': 'zh', 'Japan': 'ja',
  'Korea': 'ko', 'South Korea': 'ko',
  'Netherlands': 'nl', 'Poland': 'pl',
  'Russia': 'ru', 'Sweden': 'sv',
  'Turkey': 'tr', 'India': 'hi',
  'South Africa': 'en',
};

export function getLanguageFromCountry(country: string): string {
  return COUNTRY_TO_LANGUAGE[country] || 'en';
}

export const OPENAI_VOICES = [
  { id: 'alloy',   name: 'Alloy',   description: 'Neutral and balanced' },
  { id: 'echo',    name: 'Echo',    description: 'Warm and engaging' },
  { id: 'fable',   name: 'Fable',   description: 'Expressive and dynamic' },
  { id: 'onyx',    name: 'Onyx',    description: 'Deep and authoritative' },
  { id: 'nova',    name: 'Nova',    description: 'Friendly and upbeat' },
  { id: 'shimmer', name: 'Shimmer', description: 'Clear and bright' },
] as const;
