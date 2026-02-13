import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Only import English eagerly (fallback language, always needed)
import en from './locales/en.json';

export const languages = {
  en: { name: 'English', flag: '\u{1F1FA}\u{1F1F8}' },
  es: { name: 'Espa\u00f1ol', flag: '\u{1F1EA}\u{1F1F8}' },
};

export const languageOptions = Object.entries(languages).map(([code, info]) => ({
  code,
  name: info.name,
  flag: info.flag,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const localeLoaders: Record<string, () => Promise<{ default: any }>> = {
  es: () => import('./locales/es.json'),
};

async function loadLocale(lng: string) {
  if (lng === 'en' || !localeLoaders[lng]) return;
  if (i18n.hasResourceBundle(lng, 'translation')) return;
  const mod = await localeLoaders[lng]();
  i18n.addResourceBundle(lng, 'translation', mod.default, true, true);
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
const detectedLng = i18n.language?.split('-')[0];
if (detectedLng && detectedLng !== 'en') {
  loadLocale(detectedLng);
}

// Load locale dynamically whenever language changes
i18n.on('languageChanged', (lng) => {
  loadLocale(lng.split('-')[0]);
});

export default i18n;
