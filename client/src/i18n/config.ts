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
// Also handle prefix fallback: navigator may report 'pt' but we need 'pt-BR'
let detectedLng = i18n.language;
if (detectedLng === 'pt' || detectedLng?.startsWith('pt-')) {
  detectedLng = 'pt-BR';
  if (i18n.language !== 'pt-BR') i18n.changeLanguage('pt-BR');
}
if (detectedLng && !detectedLng.startsWith('en')) {
  loadLocale(detectedLng);
  document.documentElement.lang = detectedLng;
}

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
