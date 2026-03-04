import { useState, useCallback } from 'react';

export type DemoLang = 'en' | 'pt-BR';

const STORAGE_KEY = 'seatable-demo-lang';

const strings = {
  'en': {
    banner: 'Interactive Demo — all actions are local, no real data is affected',
    backToHome: 'Back to home',
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
    langPopupTitle: 'Prefer Portuguese?',
    langPopupDesc: 'This demo is also available in Portuguese (PT-BR).',
    langSwitchYes: 'Mudar para Portugues',
    langKeepEn: 'Keep English',
  },
  'pt-BR': {
    banner: 'Demo Interativa — todas as acoes sao locais, nenhum dado real e afetado',
    backToHome: 'Voltar ao inicio',
    cuisine: 'Italiano',
    neighborhood: 'Centro',
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

  // Show popup if user hasn't made a choice yet AND browser lang differs from default (en)
  const [showLangPopup, setShowLangPopup] = useState(!stored && browserLang !== 'en');
  const [lang, setLangState] = useState<DemoLang>(stored || 'en');

  const setLang = useCallback((newLang: DemoLang) => {
    localStorage.setItem(STORAGE_KEY, newLang);
    setLangState(newLang);
    setShowLangPopup(false);
  }, []);

  const dismissPopup = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, lang);
    setShowLangPopup(false);
  }, [lang]);

  const t = strings[lang];
  const dateLocale = lang === 'pt-BR' ? 'pt-BR' : 'en-US';

  return { lang, setLang, t, dateLocale, showLangPopup, dismissPopup };
}
