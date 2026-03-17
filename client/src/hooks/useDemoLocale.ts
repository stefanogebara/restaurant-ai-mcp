import { useState, useCallback, useEffect, useRef } from 'react';
import i18n from '../i18n/config';
import { DEMO_PRESETS } from '../data/demoPresets';

export type DemoLang = 'en' | 'pt-BR';

const STORAGE_KEY = 'seatable-demo-lang';
const USER_LANG_KEY = 'seatable-user-lang';

/**
 * Change i18n language for the demo WITHOUT corrupting the user's global
 * language preference stored in localStorage.
 */
function changeDemoLanguage(lng: string): void {
  const savedUserLang = localStorage.getItem(USER_LANG_KEY);
  i18n.changeLanguage(lng);
  // i18next-browser-languagedetector writes to localStorage on changeLanguage —
  // restore the user's original explicit choice so demo doesn't corrupt it.
  if (savedUserLang !== null) {
    localStorage.setItem(USER_LANG_KEY, savedUserLang);
  } else {
    localStorage.removeItem(USER_LANG_KEY);
  }
}

const strings = {
  'en': {
    banner: 'Interactive Demo — all actions are local, no real data is affected',
    backToHome: 'Back to home',
    restaurantName: 'La Bella Vista',
    cuisine: 'Italian',
    neighborhood: 'Downtown',
    addWalkIn: 'Add Walk-In',
    readyToGoLive: 'Ready to go live?',
    setupYourOwn: 'Set up your own restaurant in under 5 minutes.',
    getStartedFree: 'Get Started Free',
    walkInTitle: 'Add Walk-In',
    guestName: 'Guest Name',
    phone: 'Phone',
    phonePlaceholder: '+1 555-000-0000',
    namePlaceholder: 'e.g. Maria Lopez',
    partySize: 'Party Size',
    cancel: 'Cancel',
    seatGuest: 'Seat Guest',
    noTablesAvailable: 'No tables available. Consider adding to waitlist instead.',
    // Waitlist
    waitlist: 'Waitlist',
    noOneWaiting: 'No one waiting',
    waitlistEmpty: 'Guests added to the waitlist will appear here',
    guests: 'guests',
    waited: 'waited',
    seat: 'Seat',
    // Chat
    managerAI: 'Manager AI',
    demoMode: 'Demo mode — no real data',
    closeChat: 'Close chat',
    askPlaceholder: 'Ask about your restaurant...',
    sendMessage: 'Send message',
    // Language popup
    langPopupTitle: 'Prefer English?',
    langPopupDesc: 'This demo is also available in English.',
    langSwitchYes: 'Switch to English',
    langKeepEn: 'Keep Portuguese',
    // Exit intent
    exitTitle: 'Ready to get started?',
    exitMessage: 'Set up your own AI receptionist in under 5 minutes. No credit card required.',
    exitTrialCTA: 'Start Free Trial',
    exitContinue: 'Continue Demo',
  },
  'pt-BR': {
    banner: 'Demo Interativa — todas as ações são locais, nenhum dado real é afetado',
    backToHome: 'Voltar ao início',
    restaurantName: 'Cantina da Praça',
    cuisine: 'Brasileira',
    neighborhood: 'Jardins',
    addWalkIn: 'Adicionar Walk-In',
    readyToGoLive: 'Pronto para começar?',
    setupYourOwn: 'Configure seu restaurante em menos de 5 minutos.',
    getStartedFree: 'Começar Grátis',
    walkInTitle: 'Adicionar Walk-In',
    guestName: 'Nome do Cliente',
    phone: 'Telefone',
    phonePlaceholder: '+55 11 99999-0000',
    namePlaceholder: 'ex. Maria Silva',
    partySize: 'Tamanho do Grupo',
    cancel: 'Cancelar',
    seatGuest: 'Sentar Cliente',
    noTablesAvailable: 'Nenhuma mesa disponível. Considere adicionar à lista de espera.',
    // Waitlist
    waitlist: 'Lista de Espera',
    noOneWaiting: 'Ninguém esperando',
    waitlistEmpty: 'Clientes adicionados à lista de espera aparecerão aqui',
    guests: 'pessoas',
    waited: 'espera',
    seat: 'Sentar',
    // Chat
    managerAI: 'Gerente IA',
    demoMode: 'Modo demo — sem dados reais',
    closeChat: 'Fechar chat',
    askPlaceholder: 'Pergunte sobre seu restaurante...',
    sendMessage: 'Enviar mensagem',
    // Language popup
    langPopupTitle: 'Prefere Inglês?',
    langPopupDesc: 'Este demo também está disponível em inglês.',
    langSwitchYes: 'Mudar para Inglês',
    langKeepEn: 'Manter Português',
    // Exit intent
    exitTitle: 'Pronto para começar?',
    exitMessage: 'Configure sua recepcionista IA em menos de 5 minutos. Sem cartão de crédito.',
    exitTrialCTA: 'Começar Teste Grátis',
    exitContinue: 'Continuar Demo',
  },
} as const;

export type DemoStrings = typeof strings['en'];

function detectBrowserLang(): DemoLang {
  const nav = navigator.language || '';
  if (nav.startsWith('pt')) return 'pt-BR';
  return 'en';
}

export function useDemoLocale() {
  const stored = localStorage.getItem(STORAGE_KEY) as DemoLang | null;
  const browserLang = detectBrowserLang();

  // Read restaurant identity from URL params (set by demo creation API or preset)
  const urlParams = new URLSearchParams(window.location.search);
  const presetKey = urlParams.get('preset');
  const preset = presetKey ? DEMO_PRESETS[presetKey] : undefined;
  const urlName = preset?.name || urlParams.get('name');
  const urlCuisine = preset?.cuisine || urlParams.get('cuisine');
  const urlCity = preset?.neighborhood || urlParams.get('city');

  // Presets default to English; regular demo defaults to PT-BR
  const defaultLang: DemoLang = preset ? 'en' : 'pt-BR';
  const [showLangPopup, setShowLangPopup] = useState(!stored && !preset && !browserLang.startsWith('pt'));
  const [lang, setLangState] = useState<DemoLang>(stored || defaultLang);

  // Sync i18next with demo locale on mount, restore original on unmount.
  // Uses changeDemoLanguage to avoid corrupting the user's saved language.
  const originalLngRef = useRef(i18n.language);
  useEffect(() => {
    const target = stored || defaultLang;
    if (i18n.language !== target) {
      changeDemoLanguage(target);
    }
    return () => {
      // Restore the user's original language when leaving the demo
      const original = originalLngRef.current;
      if (original && original !== i18n.language) {
        changeDemoLanguage(original);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setLang = useCallback((newLang: DemoLang) => {
    localStorage.setItem(STORAGE_KEY, newLang);
    setLangState(newLang);
    setShowLangPopup(false);
    // Sync i18next so shared components (StatsBar etc.) update too
    changeDemoLanguage(newLang === 'pt-BR' ? 'pt-BR' : 'en');
  }, []);

  const dismissPopup = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, lang);
    setShowLangPopup(false);
  }, [lang]);

  const base = strings[lang];
  const t = urlName ? {
    ...base,
    restaurantName: urlName,
    cuisine: urlCuisine || base.cuisine,
    neighborhood: urlCity || base.neighborhood,
  } : base;
  const dateLocale = lang === 'pt-BR' ? 'pt-BR' : 'en-US';

  return { lang, setLang, t, dateLocale, showLangPopup, dismissPopup };
}
