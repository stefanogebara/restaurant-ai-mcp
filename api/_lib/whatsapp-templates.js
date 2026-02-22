/**
 * WhatsApp Message Templates
 *
 * Reusable message templates for WhatsApp notifications.
 * Supports EN and ES languages with variable interpolation.
 *
 * Usage:
 *   const { getTemplate } = require('./whatsapp-templates');
 *   const msg = getTemplate('reservation_confirmed', 'en', { name, restaurant, date, time, partySize });
 */

const { createSecureLogger } = require('./secure-logger');
const logger = createSecureLogger('WhatsAppTemplates');

// ============================================================
// Template Definitions
// ============================================================

const TEMPLATES = {
  reservation_confirmed: {
    en: ({ name, restaurant, date, time, partySize, reservationId }) =>
      `Hi ${name}, your reservation at ${restaurant} is confirmed!\n\n` +
      `Date: ${date}\n` +
      `Time: ${time}\n` +
      `Guests: ${partySize}\n` +
      `Confirmation: ${reservationId}\n\n` +
      `Reply MODIFY to change or CANCEL to cancel.`,

    es: ({ name, restaurant, date, time, partySize, reservationId }) =>
      `Hola ${name}, tu reserva en ${restaurant} esta confirmada!\n\n` +
      `Fecha: ${date}\n` +
      `Hora: ${time}\n` +
      `Personas: ${partySize}\n` +
      `Confirmacion: ${reservationId}\n\n` +
      `Responde MODIFICAR para cambiar o CANCELAR para cancelar.`,
  },

  reservation_modified: {
    en: ({ name, reservationId, date, time, partySize }) =>
      `Hi ${name}, your reservation ${reservationId} has been updated.\n\n` +
      `New date: ${date}\n` +
      `New time: ${time}\n` +
      `Guests: ${partySize}\n\n` +
      `Reply CANCEL if you need to cancel.`,

    es: ({ name, reservationId, date, time, partySize }) =>
      `Hola ${name}, tu reserva ${reservationId} ha sido actualizada.\n\n` +
      `Nueva fecha: ${date}\n` +
      `Nueva hora: ${time}\n` +
      `Personas: ${partySize}\n\n` +
      `Responde CANCELAR si necesitas cancelar.`,
  },

  reservation_cancelled: {
    en: ({ name, reservationId, restaurant }) =>
      `Hi ${name}, your reservation ${reservationId} at ${restaurant} has been cancelled.\n\n` +
      `We hope to see you again soon! Reply BOOK to make a new reservation.`,

    es: ({ name, reservationId, restaurant }) =>
      `Hola ${name}, tu reserva ${reservationId} en ${restaurant} ha sido cancelada.\n\n` +
      `Esperamos verte pronto! Responde RESERVAR para hacer una nueva reserva.`,
  },

  reservation_reminder: {
    en: ({ name, restaurant, date, time, partySize }) =>
      `Hi ${name}, this is a reminder about your reservation at ${restaurant}.\n\n` +
      `Date: ${date}\n` +
      `Time: ${time}\n` +
      `Guests: ${partySize}\n\n` +
      `Reply CANCEL if you can no longer make it.`,

    es: ({ name, restaurant, date, time, partySize }) =>
      `Hola ${name}, te recordamos tu reserva en ${restaurant}.\n\n` +
      `Fecha: ${date}\n` +
      `Hora: ${time}\n` +
      `Personas: ${partySize}\n\n` +
      `Responde CANCELAR si no puedes asistir.`,
  },

  welcome: {
    en: ({ restaurant }) =>
      `Welcome to ${restaurant}! I'm your AI reservation assistant.\n\n` +
      `I can help you:\n` +
      `- Book a table\n` +
      `- Check availability\n` +
      `- Modify or cancel a reservation\n\n` +
      `How can I help you today?`,

    es: ({ restaurant }) =>
      `Bienvenido a ${restaurant}! Soy tu asistente de reservas.\n\n` +
      `Puedo ayudarte a:\n` +
      `- Reservar una mesa\n` +
      `- Consultar disponibilidad\n` +
      `- Modificar o cancelar una reserva\n\n` +
      `Como puedo ayudarte hoy?`,
  },

  waitlist_added: {
    en: ({ name, restaurant, partySize, estimatedWait }) =>
      `Hi ${name}, you've been added to the waitlist at ${restaurant}.\n\n` +
      `Party size: ${partySize}\n` +
      `Estimated wait: ${estimatedWait} minutes\n\n` +
      `We'll notify you when your table is ready!`,

    es: ({ name, restaurant, partySize, estimatedWait }) =>
      `Hola ${name}, has sido agregado a la lista de espera en ${restaurant}.\n\n` +
      `Personas: ${partySize}\n` +
      `Espera estimada: ${estimatedWait} minutos\n\n` +
      `Te avisaremos cuando tu mesa este lista!`,
  },

  table_ready: {
    en: ({ name, restaurant }) =>
      `Hi ${name}, great news! Your table at ${restaurant} is ready.\n\n` +
      `Please head to the host stand. We'll hold your table for 10 minutes.`,

    es: ({ name, restaurant }) =>
      `Hola ${name}, buenas noticias! Tu mesa en ${restaurant} esta lista.\n\n` +
      `Por favor dirigete a la entrada. Reservaremos tu mesa por 10 minutos.`,
  },

  new_booking_alert: {
    en: ({ customerName, partySize, date, time, phone, reservationId }) =>
      `New booking!\n\n` +
      `Guest: ${customerName}\n` +
      `Party: ${partySize} guest${partySize !== 1 ? 's' : ''}\n` +
      `Date: ${date}\n` +
      `Time: ${time}\n` +
      `Phone: ${phone}\n` +
      `Ref: ${reservationId}`,

    es: ({ customerName, partySize, date, time, phone, reservationId }) =>
      `Nueva reserva!\n\n` +
      `Cliente: ${customerName}\n` +
      `Personas: ${partySize}\n` +
      `Fecha: ${date}\n` +
      `Hora: ${time}\n` +
      `Tel: ${phone}\n` +
      `Ref: ${reservationId}`,

    pt: ({ customerName, partySize, date, time, phone, reservationId }) =>
      `Nova reserva!\n\n` +
      `Cliente: ${customerName}\n` +
      `Pessoas: ${partySize}\n` +
      `Data: ${date}\n` +
      `Horario: ${time}\n` +
      `Tel: ${phone}\n` +
      `Ref: ${reservationId}`,
  },
};

// ============================================================
// Public API
// ============================================================

/**
 * Get a formatted message from a template.
 *
 * @param {string} templateName - Template key (e.g. 'reservation_confirmed')
 * @param {string} lang        - Language code ('en' or 'es'), defaults to 'en'
 * @param {object} vars        - Variables to interpolate into the template
 * @returns {string|null}      - Formatted message or null if template not found
 */
function getTemplate(templateName, lang = 'en', vars = {}) {
  const template = TEMPLATES[templateName];
  if (!template) {
    logger.warn(`Template not found: ${templateName}`);
    return null;
  }

  const langTemplate = template[lang] || template['en'];
  if (!langTemplate) {
    logger.warn(`Language ${lang} not found for template ${templateName}`);
    return null;
  }

  try {
    return langTemplate(vars);
  } catch (err) {
    logger.error(`Error rendering template ${templateName}:`, err);
    return null;
  }
}

/**
 * Get all available template names.
 * @returns {string[]}
 */
function getTemplateNames() {
  return Object.keys(TEMPLATES);
}

/**
 * Check if a template exists.
 * @param {string} templateName
 * @returns {boolean}
 */
function hasTemplate(templateName) {
  return templateName in TEMPLATES;
}

module.exports = {
  getTemplate,
  getTemplateNames,
  hasTemplate,
  TEMPLATES,
};
