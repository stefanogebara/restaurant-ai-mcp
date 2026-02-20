import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Only import English eagerly (fallback language, always needed)
import en from './locales/en.json';

export const languages = {
  en: { name: 'English', flag: '\u{1F1FA}\u{1F1F8}' },
  es: { name: 'Espa\u00f1ol', flag: '\u{1F1EA}\u{1F1F8}' },
  'pt-BR': { name: 'Portugu\u00eas (BR)', flag: '\u{1F1E7}\u{1F1F7}' },
};

export const languageOptions = Object.entries(languages).map(([code, info]) => ({
  code,
  name: info.name,
  flag: info.flag,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const localeLoaders: Record<string, () => Promise<{ default: any }>> = {
  es: () => import('./locales/es.json'),
  'pt-BR': () => import('./locales/pt-BR.json'),
};

/**
 * Resolve a detected language to a supported locale key.
 * Handles pt → pt-BR mapping and strips region from codes like en-US → en.
 */
function resolveLocale(lng: string): string {
  // Direct match (e.g. 'pt-BR', 'en', 'es')
  if (lng in languages) return lng;

  // Map pt (any variant) to pt-BR
  if (lng === 'pt' || lng.startsWith('pt-')) return 'pt-BR';

  // Strip region for other languages (en-US → en, es-MX → es)
  const base = lng.split('-')[0];
  if (base in languages) return base;

  return 'en';
}

async function loadLocale(lng: string) {
  const resolved = resolveLocale(lng);
  if (resolved === 'en') return;
  if (i18n.hasResourceBundle(resolved, 'translation')) return;
  const loader = localeLoaders[resolved];
  if (!loader) return;
  const mod = await loader();
  i18n.addResourceBundle(resolved, 'translation', mod.default, true, true);
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
const detectedLng = i18n.language || '';
const resolvedStartup = resolveLocale(detectedLng);
if (resolvedStartup !== 'en') {
  loadLocale(resolvedStartup).then(() => {
    // Switch i18n to resolved locale if it differs from detected
    if (i18n.language !== resolvedStartup) {
      i18n.changeLanguage(resolvedStartup);
    }
  });
}

// Load locale dynamically whenever language changes
i18n.on('languageChanged', (lng) => {
  loadLocale(lng);
});

export default i18n;
