/** Default first message used when no custom agent greeting is saved. */
function buildDefaultVoiceGreeting(restaurantName, language = 'en') {
  const greetings = {
    en: `Hello! Welcome to ${restaurantName}. How can I help you today?`,
    es: `¡Hola! Bienvenido a ${restaurantName}. ¿En qué puedo ayudarle hoy?`,
    fr: `Bonjour ! Bienvenue chez ${restaurantName}. Comment puis-je vous aider ?`,
    de: `Hallo! Willkommen bei ${restaurantName}. Wie kann ich Ihnen helfen?`,
    it: `Ciao! Benvenuto da ${restaurantName}. Come posso aiutarti oggi?`,
    pt: `Olá! Bem-vindo ao ${restaurantName}. Como posso ajudá-lo hoje?`,
    nl: `Hallo! Welkom bij ${restaurantName}. Hoe kan ik u helpen?`,
    pl: `Cześć! Witamy w ${restaurantName}. Jak mogę Ci pomóc?`,
    sv: `Hej! Välkommen till ${restaurantName}. Hur kan jag hjälpa dig?`,
    tr: `Merhaba! ${restaurantName}'a hoş geldiniz. Size nasıl yardımcı olabilirim?`,
    ja: `こんにちは！${restaurantName}へようこそ。ご用件をお伺いします。`,
    ko: `안녕하세요! ${restaurantName}에 오신 것을 환영합니다. 무엇을 도와드릴까요?`,
    zh: `您好！欢迎来到${restaurantName}。我能为您做些什么？`,
    ru: `Здравствуйте! Добро пожаловать в ${restaurantName}. Чем могу помочь?`,
    hi: `नमस्ते! ${restaurantName} में आपका स्वागत है। मैं आपकी कैसे मदद कर सकता हूँ?`,
  };
  const baseLanguage = language.split('-')[0];
  return greetings[baseLanguage] || greetings.en;
}

module.exports = { buildDefaultVoiceGreeting };
