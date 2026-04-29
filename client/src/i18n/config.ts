import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import all locales eagerly so language switches are synchronous (no async waterfall)
import en from './locales/en.json';
import ptBR from './locales/pt-BR.json';
import es from './locales/es.json';

export const languages = {
  en: { name: 'English', flag: '\u{1F1FA}\u{1F1F8}' },
  es: { name: 'Espa\u00f1ol', flag: '\u{1F1EA}\u{1F1F8}' },
  'pt-BR': { name: 'Portugu\u00eas', flag: '\u{1F1E7}\u{1F1F7}' },
};

export const languageOptions = Object.entries(languages).map(([code, info]) => ({
  code,
  name: info.name,
  flag: info.flag,
}));

const localeLoaders: Record<string, () => Promise<{ default: Record<string, unknown> }>> = {
  es: () => import('./locales/es.json'),
  'pt-BR': () => import('./locales/pt-BR.json'),
};

async function loadLocale(lng: string) {
  // Try exact match first (e.g. 'pt-BR'), then prefix fallback (e.g. 'es')
  const key = localeLoaders[lng] ? lng : lng.split('-')[0];
  if (key === 'en' || !localeLoaders[key]) return;
  if (i18n.hasResourceBundle(key, 'translation')) return;
  const mod = await localeLoaders[key]();
  const translations = mod.default || mod;
  i18n.addResourceBundle(key, 'translation', translations, true, true);
}

/** Pre-load locale before switching — avoids race where React renders before translations arrive */
export async function preloadAndSwitchLanguage(lng: string) {
  await loadLocale(lng);
  await i18n.changeLanguage(lng);
}

/** Switch language for demo contexts without corrupting the user's saved language preference.
 *  The LanguageDetector writes to localStorage on changeLanguage — this function preserves
 *  the user's original explicit choice stored in seatable-user-lang. */
export async function preloadAndSwitchDemoLanguage(lng: string) {
  const savedUserLang = localStorage.getItem('seatable-user-lang');
  await preloadAndSwitchLanguage(lng);
  // Restore user's preference so they aren't permanently switched by a demo visit
  if (savedUserLang !== null) {
    localStorage.setItem('seatable-user-lang', savedUserLang);
  } else {
    localStorage.removeItem('seatable-user-lang');
  }
}

// One-time migration: move explicit language choice from old key to new key.
// Existing users may have 'i18nextLng' set from the old detector config.
if (!localStorage.getItem('seatable-user-lang') && localStorage.getItem('i18nextLng')) {
  const oldLang = localStorage.getItem('i18nextLng')!;
  localStorage.setItem('seatable-user-lang', oldLang);
  localStorage.removeItem('i18nextLng');
}

/** Normalize detected language codes to our supported set (en, es, pt-BR).
 *  Brazilian-first product: cold visitors default to PT-BR. Many BR users have
 *  English-locale browsers (work laptops, EN-default OS) but want a PT product
 *  experience. Only Spanish navigator hint switches to ES; everyone else lands
 *  in PT-BR and can toggle to EN/ES via the language switcher.
 *  Returning users keep their explicit choice via localStorage (seatable-user-lang). */
function normalizeLanguage(lng: string): string {
  if (lng === 'pt' || lng.startsWith('pt-')) return 'pt-BR';
  if (lng.startsWith('es')) return 'es';
  return 'pt-BR';
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      'pt-BR': { translation: ptBR },
      es: { translation: es },
    },
    fallbackLng: 'pt-BR',
    debug: false,
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    detection: {
      // Explicit user choice (seatable-user-lang) takes priority.
      // i18nextLng is the auto-written cache — only used as secondary fallback.
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'seatable-user-lang',
      convertDetectedLanguage: normalizeLanguage,
    },
  });

// Load the detected language on startup (if not English)
const detectedLng = i18n.language;
export const i18nReady: Promise<void> = (detectedLng && !detectedLng.startsWith('en'))
  ? loadLocale(detectedLng).then(() => { document.documentElement.lang = detectedLng; })
  : Promise.resolve();

// Load locale dynamically whenever language changes
i18n.on('languageChanged', (lng) => {
  loadLocale(lng);
  // Update <html lang> for screen readers (P2-11)
  document.documentElement.lang = lng;
  // Update <title> and <meta description> for SEO (P2-12)
  const titles: Record<string, string> = {
    'pt-BR': 'seatable - Gestão de Restaurantes com IA',
    es: 'seatable - Gestión de Restaurantes con IA',
  };
  const descs: Record<string, string> = {
    'pt-BR': 'Gerencie reservas, mesas e atendimento do seu restaurante com inteligência artificial. Agente de voz, WhatsApp e painel em tempo real.',
    es: 'Gestiona reservas, mesas y atención de tu restaurante con inteligencia artificial.',
  };
  document.title = titles[lng] || 'seatable - AI Restaurant Management';
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) {
    metaDesc.setAttribute('content', descs[lng] || 'AI-powered restaurant management platform. Voice agent, WhatsApp bookings, and real-time dashboard.');
  }
});

export default i18n;
