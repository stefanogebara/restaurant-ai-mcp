/** The opening line spoken by the live agent. Shared by creation and edits. */
function buildFirstMessage({ restaurant_name, language = 'en', custom_greeting }) {
  if (typeof custom_greeting === 'string' && custom_greeting.trim()) {
    return custom_greeting.trim();
  }

  const name = restaurant_name || 'our restaurant';
  const greetings = {
    en: `Thank you for calling ${name}. How may I help you today?`,
    es: `Gracias por llamar a ${name}. ¿En qué puedo ayudarle hoy?`,
    fr: `Merci d'avoir appelé ${name}. Comment puis-je vous aider aujourd'hui?`,
    de: `Hallo! Willkommen bei ${name}. Wie kann ich Ihnen helfen?`,
    it: `Grazie per aver chiamato ${name}. Come posso aiutarla oggi?`,
    pt: `Obrigado por ligar para ${name}. Como posso ajudá-lo hoje?`,
    nl: `Hallo! Welkom bij ${name}. Hoe kan ik u helpen?`,
    pl: `Cześć! Witamy w ${name}. Jak mogę Ci pomóc?`,
    sv: `Hej! Välkommen till ${name}. Hur kan jag hjälpa dig?`,
    tr: `Merhaba! ${name}'a hoş geldiniz. Size nasıl yardımcı olabilirim?`,
    ja: `こんにちは！${name}へようこそ。ご用件をお伺いします。`,
    ko: `안녕하세요! ${name}에 오신 것을 환영합니다. 무엇을 도와드릴까요?`,
    zh: `您好！欢迎来到${name}。我能为您做些什么？`,
    ru: `Здравствуйте! Добро пожаловать в ${name}. Чем могу помочь?`,
    hi: `नमस्ते! ${name} में आपका स्वागत है। मैं आपकी कैसे मदद कर सकता हूँ?`,
  };
  const baseLanguage = String(language).toLowerCase().split('-')[0];
  return greetings[baseLanguage] || greetings.en;
}

module.exports = { buildFirstMessage };
