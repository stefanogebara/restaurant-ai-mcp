/**
 * Dados de exemplo do demo (mesas + reservas).
 *
 * Mora em _lib porque esta função já teve DOIS bugs em produção e nenhum
 * tinha teste — testá-la exigia rodar o handler inteiro:
 *
 *  1. Horários fixos 19:30–20:30: um demo criado às 22h abria com
 *     "Tudo em Dia — sem reservas futuras" logo depois do aha.
 *  2. A correção usou UTC: às 19:38 em São Paulo (22:38 UTC) os seeds
 *     rolavam para "amanhã" e o painel nascia vazio EXATAMENTE no horário
 *     nobre de jantar — o caso que a correção existia para resolver.
 *     (Auditoria em produção, 24/ago.)
 */

function buildFakeTables(restaurantId) {
  return [
    { restaurant_id: restaurantId, table_number: 1,  capacity: 2, location: 'window',  status: 'available', is_active: true },
    { restaurant_id: restaurantId, table_number: 2,  capacity: 2, location: 'window',  status: 'available', is_active: true },
    { restaurant_id: restaurantId, table_number: 3,  capacity: 4, location: 'indoor',  status: 'available', is_active: true },
    { restaurant_id: restaurantId, table_number: 4,  capacity: 4, location: 'indoor',  status: 'available', is_active: true },
    { restaurant_id: restaurantId, table_number: 5,  capacity: 4, location: 'indoor',  status: 'available', is_active: true },
    { restaurant_id: restaurantId, table_number: 6,  capacity: 6, location: 'indoor',  status: 'available', is_active: true },
    { restaurant_id: restaurantId, table_number: 7,  capacity: 6, location: 'terrace', status: 'available', is_active: true },
    { restaurant_id: restaurantId, table_number: 8,  capacity: 8, location: 'terrace', status: 'available', is_active: true },
  ];
}

const { generateSecureReservationId } = require('./secure-id');

const FAKE_NAMES = [
  'Ana Costa', 'Pedro Santos', 'Julia Oliveira', 'Rafael Lima',
  'Mariana Silva', 'Lucas Ferreira', 'Camila Souza', 'Gabriel Almeida',
];

const FAKE_TIMES = ['12:00', '12:30', '13:00', '19:00', '19:30', '20:00', '20:30', '21:00'];

function buildFakeReservations(restaurantId, timezone = 'America/Sao_Paulo') {
  const reservations = [];
  const now = new Date();

  // Datas e horas no fuso do RESTAURANTE, nunca em UTC.
  //
  // A correção anterior (G0.12) deixou os horários relativos à criação, mas
  // seguiu calculando em UTC — e o Brasil é UTC-3. Auditoria em produção
  // (24/ago, 19:38 em São Paulo = 22:38 UTC): os seeds rolaram para "amanhã"
  // e o painel nasceu vazio EXATAMENTE no horário nobre de jantar, que é o
  // caso que a correção existia para resolver.
  const fmtData = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const fmtHora = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const todayStr = fmtData.format(now);

  // 3 reservas "de hoje" para o painel não nascer vazio — em horários
  // RELATIVOS à criação. Os horários fixos 19:30–20:30 faziam um demo criado
  // às 22h abrir com "Tudo em Dia — sem reservas futuras" logo depois do aha
  // (walkthrough 24/ago). Regra: próximos slots de 30min a partir de +60min;
  // o que passar de 23:30 rola para o jantar de amanhã.
  const todayNames = ['Ana Costa', 'Pedro Santos', 'Julia Oliveira'];
  const todayParty = [2, 4, 3];
  const amanhaStr = fmtData.format(new Date(now.getTime() + 86400000));
  const fallbackTimes = ['19:30', '20:00', '20:30'];
  for (let i = 0; i < 3; i++) {
    const slot = new Date(now.getTime() + (60 + i * 30) * 60000);
    // Arredonda para :00 ou :30 JÁ no fuso local.
    const [hLocal, mLocal] = fmtHora.format(slot).split(':').map(Number);
    const hora = mLocal < 30 ? hLocal : hLocal + 1;
    const minuto = mLocal < 30 ? 30 : 0;
    // Cabe hoje? Mesma data local E antes das 23:30 (hora pode virar 24 no
    // arredondamento — aí já é amanhã por construção).
    const mesmaData = fmtData.format(slot) === todayStr;
    const dentroDoServico = hora < 23 || (hora === 23 && minuto === 0);
    const sameDay = mesmaData && dentroDoServico;
    reservations.push({
      reservation_id: generateSecureReservationId(),
      restaurant_id: restaurantId,
      customer_name: todayNames[i],
      customer_phone: null,
      customer_email: null,
      party_size: todayParty[i],
      date: sameDay ? todayStr : amanhaStr,
      time: sameDay
        ? `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`
        : fallbackTimes[i],
      status: 'confirmed',
      special_requests: i === 2 ? 'Aniversário' : null,
    });
  }

  // 5 future reservations spread over next days
  for (let i = 0; i < 5; i++) {
    const dateStr = fmtData.format(new Date(now.getTime() + (i + 1) * 86400000));

    reservations.push({
      reservation_id: generateSecureReservationId(),
      restaurant_id: restaurantId,
      customer_name: FAKE_NAMES[i + 3],
      customer_phone: null,
      customer_email: null,
      party_size: 2 + (i % 4),
      date: dateStr,
      time: FAKE_TIMES[i % FAKE_TIMES.length],
      status: 'confirmed',
      special_requests: null,
    });
  }

  // One checked-in reservation for today (realistic dinner time)
  reservations.push({
    reservation_id: generateSecureReservationId(),
    restaurant_id: restaurantId,
    customer_name: 'Isabela Martins',
    customer_phone: null,
    customer_email: null,
    party_size: 3,
    date: todayStr,
    time: '20:00',
    status: 'confirmed',
    checked_in_at: now.toISOString(),
    special_requests: null,
  });

  return reservations;
}


module.exports = { buildFakeTables, buildFakeReservations };
