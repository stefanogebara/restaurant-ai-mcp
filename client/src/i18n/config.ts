import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Only import English eagerly (fallback language, always needed)
import en from './locales/en.json';

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
  i18n.addResourceBundle(key, 'translation', mod.default, true, true);
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
    },
    fallbackLng: 'en',
    debug: false,
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },
  });

// Load the detected language on startup (if not English)
const detectedLng = i18n.language;
if (detectedLng && !detectedLng.startsWith('en')) {
  loadLocale(detectedLng);
}

// Load locale dynamically whenever language changes
i18n.on('languageChanged', (lng) => {
  loadLocale(lng);
});

export default i18n;
