import { useState, useCallback, useEffect } from 'react';
import i18n from '../i18n/config';

export type DemoLang = 'en' | 'pt-BR';

const STORAGE_KEY = 'seatable-demo-lang';

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
    langKeepEn: 'Manter Portugues',
    // Exit intent
    exitTitle: 'Before you go...',
    exitMessage: 'Have questions about bringing Seatable to your restaurant? Our team is ready to help.',
    exitWhatsappCTA: 'Chat with us on WhatsApp',
    exitContinue: 'Continue Demo',
  },
  'pt-BR': {
    banner: 'Demo Interativa — todas as acoes sao locais, nenhum dado real e afetado',
    backToHome: 'Voltar ao inicio',
    restaurantName: 'Cantina da Praca',
    cuisine: 'Brasileira',
    neighborhood: 'Jardins',
    addWalkIn: 'Adicionar Walk-In',
    readyToGoLive: 'Pronto para comecar?',
    setupYourOwn: 'Configure seu restaurante em menos de 5 minutos.',
    getStartedFree: 'Comecar Gratis',
    walkInTitle: 'Adicionar Walk-In',
    guestName: 'Nome do Cliente',
    phone: 'Telefone',
    phonePlaceholder: '+55 11 99999-0000',
    namePlaceholder: 'ex. Maria Silva',
    partySize: 'Tamanho do Grupo',
    cancel: 'Cancelar',
    seatGuest: 'Sentar Cliente',
    noTablesAvailable: 'Nenhuma mesa disponivel. Considere adicionar a lista de espera.',
    // Waitlist
    waitlist: 'Lista de Espera',
    noOneWaiting: 'Ninguem esperando',
    waitlistEmpty: 'Clientes adicionados a lista de espera aparecerao aqui',
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
    langPopupTitle: 'Prefer English?',
    langPopupDesc: 'This demo is also available in English.',
    langSwitchYes: 'Switch to English',
    langKeepEn: 'Manter Portugues',
    // Exit intent
    exitTitle: 'Antes de sair...',
    exitMessage: 'Tem duvidas sobre o Seatable para seu restaurante? Nossa equipe esta pronta para ajudar.',
    exitWhatsappCTA: 'Falar no WhatsApp',
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

  // Read restaurant identity from URL params (set by demo creation API)
  const urlParams = new URLSearchParams(window.location.search);
  const urlName = urlParams.get('name');
  const urlCuisine = urlParams.get('cuisine');
  const urlCity = urlParams.get('city');

  // Default is PT-BR. Show popup only if browser is NOT Portuguese (offer English).
  const [showLangPopup, setShowLangPopup] = useState(!stored && !browserLang.startsWith('pt'));
  const [lang, setLangState] = useState<DemoLang>(stored || 'pt-BR');

  // Sync i18next with demo locale on mount
  useEffect(() => {
    const target = stored || 'pt-BR';
    if (i18n.language !== target) {
      i18n.changeLanguage(target);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setLang = useCallback((newLang: DemoLang) => {
    localStorage.setItem(STORAGE_KEY, newLang);
    setLangState(newLang);
    setShowLangPopup(false);
    // Sync i18next so shared components (StatsBar etc.) update too
    i18n.changeLanguage(newLang === 'pt-BR' ? 'pt-BR' : 'en');
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
