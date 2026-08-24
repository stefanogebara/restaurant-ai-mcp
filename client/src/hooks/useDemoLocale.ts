import { useState, useCallback, useEffect, useRef } from 'react';
import i18n from '../i18n/config';
import { DEMO_PRESETS } from '../data/demoPresets';

export type DemoLang = 'en' | 'pt-BR' | 'es';

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
    seat: 'Seat now',
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
    // Conversation-first overlay (Ato 1)
    convEyebrow: 'Your demo starts with a conversation',
    convTitle: 'Talk to your AI receptionist — as if you were a guest',
    convSkip: 'Skip and see the dashboard →',
    convBooked: 'Reservation confirmed — watch it land on your dashboard',
    convBookedCta: 'See it on the dashboard',
    payoffTitle: 'Your AI just booked this',
    viaWhatsAppNow: 'via WhatsApp · just now',
    manualCardTitle: 'Configured by you, just now',
    manualCardBody: "No Google listing, no problem — this is how your receptionist will greet your restaurant's first guest.",
    captureTitle: 'Like it? Continue on your WhatsApp',
    captureEmailToggle: "I'd rather get the link by email",
    captureEmailSend: 'Send link',
    captureEmailDone: 'Sent! Check your inbox.',
    captureEmailError: "We couldn't save it right now — try again.",
    daysLeftSuffix: 'days left',
    keepData: 'Keep my data',
    exitCaptureMessage: 'Before you go: see the receptionist on YOUR WhatsApp — from the same number that will talk to your guests.',
    // Loading
    loadingDemo: 'Loading demo...',
    // A11y / banners
    toggleLanguage: 'Toggle language',
    close: 'Close',
    tokenErrorTitle: 'We could not load your personalised demo',
    tokenErrorBody: 'The link may have expired. Showing a generic demo — create a fresh one to see your restaurant.',
    createNewDemo: 'Create a new demo',
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
    cancelReservation: 'Cancelar reserva',
    // Waitlist
    waitlist: 'Lista de Espera',
    noOneWaiting: 'Ninguém esperando',
    waitlistEmpty: 'Clientes adicionados à lista de espera aparecerão aqui',
    guests: 'pessoas',
    waited: 'espera',
    // Audit copy: "Sentar" → "Acomodar" — softer hospitality verb. Same
    // change shipped to DemoWaitlistPanel earlier; this second locale table
    // is used by the preset-driven demo flows, so kept in sync here.
    seat: 'Acomodar',
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
    // Conversation-first overlay (Ato 1)
    convEyebrow: 'Seu demo começa numa conversa',
    convTitle: 'Fale com a sua recepcionista IA — como se você fosse um cliente',
    convSkip: 'Pular e ver o painel →',
    convBooked: 'Reserva confirmada — veja ela cair no seu painel',
    convBookedCta: 'Ver no painel',
    payoffTitle: 'Sua IA acabou de fechar esta reserva',
    viaWhatsAppNow: 'via WhatsApp · agora',
    manualCardTitle: 'Configurada por você, agora mesmo',
    manualCardBody: 'Sem Google, sem problema — é assim que a sua recepcionista vai atender o primeiro cliente do seu restaurante.',
    captureTitle: 'Gostou? Continue no seu WhatsApp',
    captureEmailToggle: 'Prefiro receber o link por e-mail',
    captureEmailSend: 'Enviar link',
    captureEmailDone: 'Enviado! Confira sua caixa de entrada.',
    captureEmailError: 'Não conseguimos salvar agora — tente de novo.',
    daysLeftSuffix: 'dias restantes',
    keepData: 'Manter meus dados',
    exitCaptureMessage: 'Antes de ir: veja a recepcionista no SEU WhatsApp — do mesmo número que vai falar com seus clientes.',
    // Loading
    loadingDemo: 'Carregando demo...',
    // A11y / banners
    toggleLanguage: 'Alternar idioma',
    close: 'Fechar',
    tokenErrorTitle: 'Não foi possível carregar seu demo personalizado',
    tokenErrorBody: 'O link pode ter expirado. Mostrando um demo genérico — crie um novo para ver seu restaurante.',
    createNewDemo: 'Criar novo demo',
  },
  'es': {
    banner: 'Demo Interactiva — todas las acciones son locales, ningún dato real se ve afectado',
    backToHome: 'Volver al inicio',
    restaurantName: 'Makoto',
    cuisine: 'Alta Cocina Japonesa',
    neighborhood: 'Barrio Salamanca, Madrid',
    addWalkIn: 'Agregar Walk-In',
    readyToGoLive: '¿Listo para empezar?',
    setupYourOwn: 'Configura tu restaurante en menos de 5 minutos.',
    getStartedFree: 'Comenzar Gratis',
    walkInTitle: 'Agregar Walk-In',
    guestName: 'Nombre del Cliente',
    phone: 'Teléfono',
    phonePlaceholder: '+34 600 000 000',
    namePlaceholder: 'ej. María García',
    partySize: 'Número de Personas',
    cancel: 'Cancelar',
    seatGuest: 'Sentar Cliente',
    noTablesAvailable: 'No hay mesas disponibles. Considera añadir a la lista de espera.',
    cancelReservation: 'Cancelar reserva',
    // Waitlist
    waitlist: 'Lista de Espera',
    noOneWaiting: 'Nadie esperando',
    waitlistEmpty: 'Los clientes añadidos a la lista de espera aparecerán aquí',
    guests: 'personas',
    waited: 'espera',
    seat: 'Acomodar',
    // Chat
    managerAI: 'IA del Gerente',
    demoMode: 'Modo demo — sin datos reales',
    closeChat: 'Cerrar chat',
    askPlaceholder: 'Pregunta sobre tu restaurante...',
    sendMessage: 'Enviar mensaje',
    // Language popup
    langPopupTitle: '¿Prefiere inglés?',
    langPopupDesc: 'Este demo también está disponible en inglés.',
    langSwitchYes: 'Cambiar a inglés',
    langKeepEn: 'Mantener español',
    // Exit intent
    exitTitle: '¿Listo para empezar?',
    exitMessage: 'Configura tu recepcionista IA en menos de 5 minutos. Sin tarjeta de crédito.',
    exitTrialCTA: 'Comenzar prueba gratuita',
    exitContinue: 'Continuar demo',
    // Conversation-first overlay (Ato 1)
    convEyebrow: 'Tu demo empieza con una conversación',
    convTitle: 'Habla con tu recepcionista IA — como si fueras un cliente',
    convSkip: 'Saltar y ver el panel →',
    convBooked: 'Reserva confirmada — mira cómo cae en tu panel',
    convBookedCta: 'Ver en el panel',
    payoffTitle: 'Tu IA acaba de cerrar esta reserva',
    viaWhatsAppNow: 'vía WhatsApp · ahora',
    manualCardTitle: 'Configurada por ti, ahora mismo',
    manualCardBody: 'Sin Google, sin problema — así atenderá tu recepcionista al primer cliente de tu restaurante.',
    captureTitle: '¿Te gustó? Continúa en tu WhatsApp',
    captureEmailToggle: 'Prefiero recibir el enlace por correo',
    captureEmailSend: 'Enviar enlace',
    captureEmailDone: '¡Enviado! Revisa tu correo.',
    captureEmailError: 'No pudimos guardarlo ahora — inténtalo de nuevo.',
    daysLeftSuffix: 'días restantes',
    keepData: 'Conservar mis datos',
    exitCaptureMessage: 'Antes de irte: mira a la recepcionista en TU WhatsApp — desde el mismo número que hablará con tus clientes.',
    // Loading
    loadingDemo: 'Cargando demo...',
    // A11y / banners
    toggleLanguage: 'Cambiar idioma',
    close: 'Cerrar',
    tokenErrorTitle: 'No pudimos cargar tu demo personalizado',
    tokenErrorBody: 'El enlace puede haber expirado. Mostrando un demo genérico — crea uno nuevo para ver tu restaurante.',
    createNewDemo: 'Crear nuevo demo',
  },
} as const;

export type DemoStrings = typeof strings['en'];

// Presets that should default to Spanish
const SPANISH_PRESETS = new Set(['makoto']);

function detectBrowserLang(): DemoLang {
  const nav = navigator.language || '';
  if (nav.startsWith('pt')) return 'pt-BR';
  if (nav.startsWith('es')) return 'es';
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

  // Spanish presets (e.g. makoto) always default to Spanish.
  // Non-preset demo always defaults to PT-BR (it's the Brazilian demo).
  const currentI18nLang: DemoLang = i18n.language?.startsWith('pt') ? 'pt-BR' : i18n.language?.startsWith('es') ? 'es' : 'en';
  const defaultLang: DemoLang = presetKey && SPANISH_PRESETS.has(presetKey) ? 'es' : (preset ? currentI18nLang : 'pt-BR');
  const [showLangPopup, setShowLangPopup] = useState(!stored && !preset && !browserLang.startsWith('pt') && currentI18nLang !== 'pt-BR');
  // Spanish presets always override localStorage — visitor may have 'pt-BR' stored from the
  // Brazilian demo, but Makoto expects Spanish. We also clear the stored value so the next
  // visit to a non-Spanish preset isn't forced into Spanish.
  const forcedLang: DemoLang | null = presetKey && SPANISH_PRESETS.has(presetKey) ? 'es' : null;
  if (forcedLang && stored && stored !== forcedLang) {
    // Remove the stale stored preference so it doesn't bleed back on next visit
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }
  const initialLang = forcedLang ?? stored ?? defaultLang;
  const [lang, setLangState] = useState<DemoLang>(initialLang);

  // Sync i18next with demo locale on mount, restore original on unmount.
  // Uses changeDemoLanguage to avoid corrupting the user's saved language.
  const originalLngRef = useRef(i18n.language);
  useEffect(() => {
    const target = forcedLang ?? stored ?? defaultLang;
    if (i18n.language !== target) {
      changeDemoLanguage(target);
    }
    const originalLng = originalLngRef.current;
    return () => {
      // Restore the user's original language when leaving the demo
      if (originalLng && originalLng !== i18n.language) {
        changeDemoLanguage(originalLng);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setLang = useCallback((newLang: DemoLang) => {
    localStorage.setItem(STORAGE_KEY, newLang);
    setLangState(newLang);
    setShowLangPopup(false);
    // Sync i18next so shared components (StatsBar etc.) update too
    const i18nLang = newLang === 'pt-BR' ? 'pt-BR' : newLang === 'es' ? 'es' : 'en';
    changeDemoLanguage(i18nLang);
  }, []);

  const dismissPopup = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, lang);
    setShowLangPopup(false);
  }, [lang]);

  const base = strings[lang] ?? strings['en'];
  const t = urlName ? {
    ...base,
    restaurantName: urlName,
    cuisine: urlCuisine || base.cuisine,
    neighborhood: urlCity || base.neighborhood,
  } : base;
  const dateLocale = lang === 'pt-BR' ? 'pt-BR' : lang === 'es' ? 'es-ES' : 'en-US';

  return { lang, setLang, t, dateLocale, showLangPopup, dismissPopup };
}
