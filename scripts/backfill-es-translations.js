#!/usr/bin/env node
/**
 * One-shot ES i18n backfill. Merges 125 missing keys into es.json at their
 * nested paths. Run once, delete after.
 *
 * Spanish translations targeted at Spain market (ES-ES) — matches the Madrid
 * meeting context. Currency formatting uses € (not $).
 */
const fs = require('fs');
const path = require('path');

const ES_PATH = path.join(__dirname, '..', 'client', 'src', 'i18n', 'locales', 'es.json');

// Key -> Spanish translation (Spain). 125 entries.
const TRANSLATIONS = {
  'dashboard.survey.title': 'Encuesta de Satisfacción',
  'dashboard.survey.description': 'Envía una encuesta de satisfacción por WhatsApp después de cada visita. Recoge valoraciones con estrellas y comentarios de tus clientes.',
  'dashboard.survey.enableToggle': 'Activar encuesta post-visita',
  'dashboard.survey.sendAfter': 'Enviar encuesta después de',
  'dashboard.survey.delay30min': '30 min',
  'dashboard.survey.delay1h': '1 hora',
  'dashboard.survey.delay2h': '2 horas',
  'dashboard.survey.delay4h': '4 horas',
  'dashboard.survey.delay6h': '6 horas',
  'dashboard.survey.delay12h': '12 horas',
  'dashboard.survey.delay24h': '24 horas',
  'dashboard.survey.questionLabel': 'Pregunta de la encuesta',
  'dashboard.survey.questionPlaceholder': '¿Cómo fue tu experiencia?',
  'dashboard.survey.questionHint': 'La pregunta que se envía a los clientes después de su visita.',
  'dashboard.survey.saving': 'Guardando...',
  'dashboard.survey.saveSettings': 'Guardar Configuración de Encuesta',
  'dashboard.survey.resultsTitle': 'Resultados (Últimos 30 Días)',
  'dashboard.survey.avgRating': 'Valoración Media',
  'dashboard.survey.totalResponses': 'Respuestas',
  'dashboard.survey.recentComments': 'Comentarios Recientes',
  'dashboard.survey.anonymous': 'Anónimo',
  'dashboard.survey.noResponses': 'Aún no hay respuestas de la encuesta. Los resultados aparecerán aquí cuando los clientes respondan.',

  'settings.defaultDiningDuration': 'Duración Predeterminada de la Comida',
  'settings.durationMinutes': '{{count}} minutos',
  'settings.autoConfirm': 'Confirmar reservas automáticamente',
  'settings.phoneVerPending': 'Tu número de teléfono aún no está verificado. Solicita un código de verificación a continuación.',
  'settings.reverifyPhone': 'Verificar de Nuevo',
  'settings.analyticsBriefing': 'Informe Diario de Analíticas',
  'settings.analyticsBriefingLabel': 'Analíticas diarias por WhatsApp',
  'settings.analyticsBriefingDesc': 'Recibe un resumen diario a las 9:00 con visitas, embudo de demo y métricas de conversión',
  'settings.analyticsBriefingPhone': 'Número de WhatsApp para el informe',
  'settings.phoneStatus.EXPIRED': 'EXPIRADO',
  'settings.phoneStatus.NOT_VERIFIED': 'NO VERIFICADO',
  'settings.phoneStatus.VERIFIED': 'VERIFICADO',
  'settings.loadError': 'Error al cargar la configuración del restaurante.',

  'floorPlan.tableLabel': 'Mesa',
  'floorPlan.status.available': 'Disponible',
  'floorPlan.status.occupied': 'Ocupada',
  'floorPlan.status.reserved': 'Reservada',
  'floorPlan.status.cleaning': 'Limpieza',
  'floorPlan.status.unknown': 'Desconocido',
  'floorPlan.shape.label': 'Forma',
  'floorPlan.shape.round': 'Redonda',
  'floorPlan.shape.square': 'Cuadrada',
  'floorPlan.shape.rectangle': 'Rectangular',
  'floorPlan.shape.booth': 'Cabina',
  'floorPlan.shape.barStool': 'Taburete de Bar',
  'floorPlan.capacity': 'Capacidad',
  'floorPlan.saveChanges': 'Guardar Cambios',
  'floorPlan.delete': 'Eliminar',
  'floorPlan.deleteConfirm': '¿Eliminar mesa {{number}}?',

  'landing.demoSetup.form.searchFailed': 'Búsqueda fallida',
  'landing.demoSetup.form.networkError': 'Error de red. Inténtalo de nuevo.',

  'voice.agentActive': 'Agente activo',
  'voice.agentCreating': 'Creando tu agente de voz...',
  'voice.agentCreatingDesc': 'Esto puede tardar hasta 2 minutos. Si el agente no aparece, inténtalo de nuevo a continuación.',
  'voice.agentCreationStarted': 'Creación del agente iniciada. Esto puede tardar hasta 2 minutos.',
  'voice.retryAgentCreation': 'Reintentar Creación del Agente',
  'voice.retrying': 'Creando...',

  'demo.voice.error': 'Agente de voz no disponible',
  'demo.voice.listening': 'Escuchando... toca el orbe para detener',
  'demo.voice.tapToStart': 'Toca el orbe para empezar a hablar',
  'demo.banner.expired': 'Demo expirada',
  'demo.banner.oneDayLeft': 'Modo demo · 1 día restante',
  'demo.banner.daysLeft': 'Modo demo · {{count}} días restantes',
  'demo.banner.upgrade': 'Actualiza para conservar tus datos',
  'demo.conversation.loading': 'Cargando datos del restaurante...',
  'demo.conversation.notFound': 'Demo no encontrada o expirada.',
  'demo.conversation.restaurantNotFound': 'Restaurante no encontrado. Prueba con otro nombre.',
  'demo.conversation.missingParams': 'Proporciona ?token= o ?q= en la URL.',
  'demo.conversation.loadError': 'Error al cargar los datos del restaurante.',
  'demo.conversation.settingUp': 'Configurando tu panel personalizado...',
  'demo.conversation.fewSeconds': 'Esto tarda unos segundos',
  'demo.conversation.placeholder': 'Escribe tu mensaje...',
  'demo.conversation.send': 'Enviar mensaje',
  'demo.conversation.ariaChat': 'Conversación con IA',
  'demo.errors.createFailed': 'No se pudo crear la demo. Inténtalo de nuevo.',
  'demo.errors.generic': 'Algo salió mal. Inténtalo de nuevo.',

  'eventBookings.statusPaid': 'Pagado',
  'eventBookings.statusRefunded': 'Reembolsado',
  'eventBookings.statusFailed': 'Fallido',
  'eventBookings.statusPending': 'Pendiente',

  'events.pageTitle': 'Eventos y Experiencias',
  'events.newEvent': 'Nuevo Evento',
  'events.totalEvents': 'Total',
  'events.upcomingEvents': 'Próximos',
  'events.totalBookings': 'Reservas',
  'events.estimatedRevenue': 'Ingresos Est.',
  'events.title': 'Título',
  'events.titlePlaceholder': 'ej. Noche de Cata de Vinos',
  'events.description': 'Descripción',
  'events.descriptionPlaceholder': 'Describe la experiencia...',
  'events.optional': 'opcional',
  'events.date': 'Fecha',
  'events.time': 'Hora',
  'events.duration': 'Duración (min)',
  'events.capacity': 'Capacidad',
  'events.price': 'Precio (€)',
  'events.refundPolicy': 'Política de Reembolso',
  'events.refundFull': 'Reembolso total',
  'events.refundPartial': 'Reembolso del 50%',
  'events.refundNone': 'Sin reembolso',
  'events.menuDescription': 'Menú / Detalles de la Experiencia',
  'events.menuPlaceholder': 'Describe el menú o los puntos destacados de la experiencia...',
  'events.cancel': 'Cancelar',
  'events.creating': 'Creando...',
  'events.createEvent': 'Crear Evento',
  'events.confirmDeactivate': '¿Desactivar este evento?',
  'events.booked': 'reservadas',
  'events.spotsLeft': 'restantes',
  'events.hideBookings': 'Ocultar',
  'events.viewBookings': 'Ver Reservas',
  'events.deactivate': 'Desactivar',
  'events.errorLoading': 'Error al cargar eventos',
  'events.noEvents': 'Aún no hay eventos',
  'events.noEventsHint': 'Crea tu primer evento para ofrecer experiencias únicas',
  'events.errorTitleRequired': 'El título es obligatorio',
  'events.errorDateRequired': 'La fecha es obligatoria',
  'events.errorTimeRequired': 'La hora es obligatoria',
  'events.errorCapacityRequired': 'La capacidad debe ser al menos 1',
  'events.errorPriceRequired': 'El precio debe ser 0 o mayor',
  'events.statusInactive': 'Inactivo',
  'events.statusPast': 'Finalizado',
  'events.statusFull': 'Lleno',
  'events.statusUpcoming': 'Próximo',
};

function setNestedKey(obj, dottedPath, value) {
  const parts = dottedPath.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (cur[p] === undefined || cur[p] === null) cur[p] = {};
    else if (typeof cur[p] !== 'object' || Array.isArray(cur[p])) {
      throw new Error(`Path collision at '${parts.slice(0, i + 1).join('.')}' — existing value is not an object`);
    }
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

function main() {
  const es = JSON.parse(fs.readFileSync(ES_PATH, 'utf8'));
  const keys = Object.keys(TRANSLATIONS);
  console.log(`Merging ${keys.length} translations into es.json...`);

  let added = 0;
  for (const key of keys) {
    setNestedKey(es, key, TRANSLATIONS[key]);
    added++;
  }

  fs.writeFileSync(ES_PATH, JSON.stringify(es, null, 2) + '\n');
  console.log(`Added/updated ${added} keys.`);
}

main();
