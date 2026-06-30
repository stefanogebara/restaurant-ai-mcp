'use strict';

/**
 * Scheduling brain for the prospecting agent (Phase 4 — Google Calendar booking).
 * Ported from Olivia's `_shared/olivia_agenda.ts`. PURE (no I/O), unit-tested,
 * consumed by the booking orchestrator. Generates free business-hours slots from
 * Google Calendar free/busy, formats the pt-BR proposal, validates the lead's
 * choice, and builds the event body (with Google Meet).
 *
 * TIMEZONE: Brazil abolished DST in 2019 — São Paulo is a fixed UTC-3. So a
 * constant offset (configurable) suffices instead of a timezone lib. We work in
 * ms (epoch) and ISO UTC; the "local clock" is UTC shifted by the offset.
 *
 * ANTI-INVENTION: we only propose business hours that are ACTUALLY free on the
 * calendar; we only confirm a time that was proposed (slotEhValido). Conference
 * requestId is injected (deterministic, idempotent) — never Math.random. Nothing
 * is fabricated.
 */

const AGENT_NAME = process.env.PROSPECTING_AGENT_NAME || 'Olímpia';
const COMPANY = 'Seatable';

/**
 * @typedef {{startMs: number, endMs: number}} BusyInterval
 * @typedef {{offsetMin: number, horaInicio: number, horaFim: number, duracaoMin: number, diasUteis: number, antecedenciaMin: number, passoMin: number, maxSlots: number}} AgendaConfig
 */

/** @type {AgendaConfig} */
const AGENDA_PADRAO = Object.freeze({
  offsetMin: -180,      // UTC-3 (São Paulo)
  horaInicio: 9,        // 09:00 local
  horaFim: 18,          // last start fits up to 18:00 local
  duracaoMin: 30,
  diasUteis: 5,         // business days to look ahead
  antecedenciaMin: 120, // don't propose anything within X min of now
  passoMin: 30,         // candidate granularity
  maxSlots: 3,          // how many options to offer
});

// Components of the "local clock" (UTC shifted by the offset).
function partesLocais(ms, offsetMin) {
  const d = new Date(ms + offsetMin * 60000);
  return {
    ano: d.getUTCFullYear(),
    mes: d.getUTCMonth(),
    dia: d.getUTCDate(),
    diaSemana: d.getUTCDay(),
    hora: d.getUTCHours(),
    min: d.getUTCMinutes(),
  };
}

// Build the UTC ms of a local time (ano/mes/dia/hora/min in the offset zone).
function msDeLocal(ano, mes, dia, hora, min, offsetMin) {
  return Date.UTC(ano, mes, dia, hora, min, 0) - offsetMin * 60000;
}

function ehFimDeSemana(diaSemana) {
  return diaSemana === 0 || diaSemana === 6;
}

function sobrepoe(aStart, aEnd, busy) {
  return busy.some((b) => aStart < b.endMs && aEnd > b.startMs);
}

/**
 * Up to `maxSlots` free start times (ISO UTC), on business days within the
 * business window, from `agoraMs` (+ lead time), skipping busy intervals.
 * Deterministic — `agoraMs` is injected.
 * @param {number} agoraMs
 * @param {BusyInterval[]} busy
 * @param {AgendaConfig} [cfg]
 * @returns {string[]}
 */
function proporSlots(agoraMs, busy, cfg = AGENDA_PADRAO) {
  const minInicio = agoraMs + cfg.antecedenciaMin * 60000;
  const dur = cfg.duracaoMin * 60000;
  const livres = [];

  const base = partesLocais(agoraMs, cfg.offsetMin);
  for (let d = 0; d <= cfg.diasUteis; d++) {
    const diaRef = partesLocais(
      msDeLocal(base.ano, base.mes, base.dia, 12, 0, cfg.offsetMin) + d * 86400000,
      cfg.offsetMin,
    );
    if (ehFimDeSemana(diaRef.diaSemana)) continue;

    for (let h = cfg.horaInicio; h <= cfg.horaFim; h++) {
      for (let m = 0; m < 60; m += cfg.passoMin) {
        const start = msDeLocal(diaRef.ano, diaRef.mes, diaRef.dia, h, m, cfg.offsetMin);
        const end = start + dur;
        const fim = partesLocais(end, cfg.offsetMin);
        const passouJanela = fim.hora > cfg.horaFim || (fim.hora === cfg.horaFim && fim.min > 0);
        if (passouJanela) continue;
        if (start < minInicio) continue;
        if (sobrepoe(start, end, busy)) continue;
        livres.push(start);
      }
    }
  }
  return selecionarIniciosDistribuidos(livres, cfg).map((start) => new Date(start).toISOString());
}

// Candidate START times (ms) on business days, within the window and after lead
// time — without checking busy. Used by both the single and multi paths.
function candidatosSlots(agoraMs, cfg, limite) {
  const minInicio = agoraMs + cfg.antecedenciaMin * 60000;
  const dur = cfg.duracaoMin * 60000;
  const out = [];
  const base = partesLocais(agoraMs, cfg.offsetMin);
  for (let d = 0; d <= cfg.diasUteis && out.length < limite; d++) {
    const diaRef = partesLocais(
      msDeLocal(base.ano, base.mes, base.dia, 12, 0, cfg.offsetMin) + d * 86400000,
      cfg.offsetMin,
    );
    if (ehFimDeSemana(diaRef.diaSemana)) continue;
    for (let h = cfg.horaInicio; h <= cfg.horaFim && out.length < limite; h++) {
      for (let m = 0; m < 60 && out.length < limite; m += cfg.passoMin) {
        const start = msDeLocal(diaRef.ano, diaRef.mes, diaRef.dia, h, m, cfg.offsetMin);
        const end = start + dur;
        const fim = partesLocais(end, cfg.offsetMin);
        if (fim.hora > cfg.horaFim || (fim.hora === cfg.horaFim && fim.min > 0)) continue;
        if (start < minInicio) continue;
        out.push(start);
      }
    }
  }
  return out;
}

function chaveDiaLocal(ms, offsetMin) {
  const p = partesLocais(ms, offsetMin);
  return `${p.ano}-${String(p.mes + 1).padStart(2, '0')}-${String(p.dia).padStart(2, '0')}`;
}

function minutoLocal(ms, offsetMin) {
  const p = partesLocais(ms, offsetMin);
  return p.hora * 60 + p.min;
}

function escolherMaisProximo(candidatos, targetMin, cfg) {
  if (candidatos.length === 0) return null;
  return [...candidatos].sort((a, b) => {
    const dia = chaveDiaLocal(a, cfg.offsetMin).localeCompare(chaveDiaLocal(b, cfg.offsetMin));
    if (dia !== 0) return dia;
    const dist = Math.abs(minutoLocal(a, cfg.offsetMin) - targetMin) - Math.abs(minutoLocal(b, cfg.offsetMin) - targetMin);
    if (dist !== 0) return dist;
    return a - b;
  })[0];
}

// Spread the chosen starts: first slot, a later one the same day (≥2h gap,
// afternoon-leaning), then one on another day (morning-leaning) — so the lead
// gets variety, not 3 back-to-back morning slots.
function selecionarIniciosDistribuidos(inicios, cfg) {
  const ordenados = [...inicios].sort((a, b) => a - b);
  if (ordenados.length <= cfg.maxSlots) return ordenados;

  const escolhidos = [];
  const add = (slot) => {
    if (slot !== null && slot !== undefined && !escolhidos.includes(slot) && escolhidos.length < cfg.maxSlots) {
      escolhidos.push(slot);
    }
  };

  const primeiro = ordenados[0];
  add(primeiro);

  const diaPrimeiro = chaveDiaLocal(primeiro, cfg.offsetMin);
  const duasHoras = 120 * 60000;
  const tarde = 14 * 60;
  const manhaHumana = 10 * 60;

  add(escolherMaisProximo(
    ordenados.filter((s) => chaveDiaLocal(s, cfg.offsetMin) === diaPrimeiro && s - primeiro >= duasHoras && minutoLocal(s, cfg.offsetMin) >= tarde),
    tarde, cfg,
  ));

  if (escolhidos.length < cfg.maxSlots) {
    add(escolherMaisProximo(
      ordenados.filter((s) => chaveDiaLocal(s, cfg.offsetMin) === diaPrimeiro && s - primeiro >= duasHoras),
      tarde, cfg,
    ));
  }

  add(escolherMaisProximo(
    ordenados.filter((s) => chaveDiaLocal(s, cfg.offsetMin) !== diaPrimeiro),
    manhaHumana, cfg,
  ));

  for (const slot of ordenados) add(slot);
  return escolhidos.sort((a, b) => a - b);
}

/**
 * @typedef {{iso: string, reps: string[]}} SlotComReps
 */

/**
 * Multi-rep: given free/busy PER rep (calendarId → busy intervals), propose up to
 * maxSlots times where AT LEAST ONE rep is free, listing which. Reps whose
 * calendar couldn't be read simply don't appear in `busyByRep` (anti-invention:
 * we never claim someone is free without having read their calendar).
 * @param {number} agoraMs
 * @param {Record<string, BusyInterval[]>} busyByRep
 * @param {AgendaConfig} [cfg]
 * @returns {SlotComReps[]}
 */
function proporSlotsMulti(agoraMs, busyByRep, cfg = AGENDA_PADRAO) {
  const reps = Object.keys(busyByRep);
  const dur = cfg.duracaoMin * 60000;
  const porDia = Math.ceil(((cfg.horaFim - cfg.horaInicio + 1) * 60) / cfg.passoMin);
  const limiteJanela = (cfg.diasUteis + 2) * porDia + 8;
  const candidatos = candidatosSlots(agoraMs, cfg, limiteJanela);
  const out = [];
  for (const start of candidatos) {
    const end = start + dur;
    const livres = reps.filter((r) => !sobrepoe(start, end, busyByRep[r] || []));
    if (livres.length > 0) out.push({ iso: new Date(start).toISOString(), reps: livres });
  }
  const escolhidos = new Set(
    selecionarIniciosDistribuidos(out.map((slot) => Date.parse(slot.iso)), cfg)
      .map((start) => new Date(start).toISOString()),
  );
  return out.filter((slot) => escolhidos.has(slot.iso)).slice(0, cfg.maxSlots);
}

const DIAS_ABREV = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const SEMANA_MS = 7 * 86400000;

// 00:00 local of NEXT week's Monday from agoraMs.
function proximaSegundaMs(agoraMs, offsetMin) {
  const p = partesLocais(agoraMs, offsetMin);
  const diasAteSeg = ((8 - p.diaSemana) % 7) || 7;
  return msDeLocal(p.ano, p.mes, p.dia, 0, 0, offsetMin) + diasAteSeg * 86400000;
}

/**
 * Read a WINDOW CONSTRAINT spoken by the lead ("semana que vem", "em duas
 * semanas", "mês que vem", "depois do dia 20", "depois de amanhã") and return the
 * START (ms) from which to propose. null = no deferral (propose from now).
 * Deterministic (anti-invention): the date comes from rules, not an LLM guess.
 * @param {string|null|undefined} texto
 * @param {number} agoraMs
 * @param {AgendaConfig} [cfg]
 * @returns {number|null}
 */
function parseJanelaInicio(texto, agoraMs, cfg = AGENDA_PADRAO) {
  if (!texto) return null;
  const t = String(texto).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const off = cfg.offsetMin;

  const numPorExtenso = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4 };
  let semanas = null;
  const mNum = t.match(/(\d+)\s*semanas?/);
  if (mNum) semanas = parseInt(mNum[1], 10);
  else {
    const mExt = t.match(/\b(um|uma|dois|duas|tres|quatro)\s+semanas?/);
    if (mExt) semanas = numPorExtenso[mExt[1]];
    else if (/semana\s+que\s+vem|proxima\s+semana|semana\s+proxima/.test(t)) semanas = 1;
  }
  if (semanas != null && semanas >= 1) {
    return proximaSegundaMs(agoraMs, off) + (semanas - 1) * SEMANA_MS;
  }

  if (/mes\s+que\s+vem|proximo\s+mes/.test(t)) {
    const p = partesLocais(agoraMs, off);
    return msDeLocal(p.ano, p.mes + 1, 1, 0, 0, off);
  }

  const mDia = t.match(/(?:depois do|a partir do|do)\s+dia\s+(\d{1,2})/);
  if (mDia) {
    const dia = parseInt(mDia[1], 10);
    if (dia >= 1 && dia <= 31) {
      const p = partesLocais(agoraMs, off);
      let ms = msDeLocal(p.ano, p.mes, dia, 0, 0, off);
      if (ms <= agoraMs) ms = msDeLocal(p.ano, p.mes + 1, dia, 0, 0, off);
      return ms;
    }
  }

  if (/depois\s+de\s+amanha/.test(t)) {
    const p = partesLocais(agoraMs, off);
    return msDeLocal(p.ano, p.mes, p.dia, 0, 0, off) + 2 * 86400000;
  }

  const dia = extrairDiaSugerido(t);
  if (dia) {
    if (dia.tipo === 'delta') {
      if (dia.dias === 0) return agoraMs;
      const p = partesLocais(agoraMs, off);
      return msDeLocal(p.ano, p.mes, p.dia, 0, 0, off) + dia.dias * 86400000;
    }
    return proximoDiaSemana(agoraMs, dia.diaSemana, 0, 0, cfg);
  }

  return null;
}

const pad = (n) => String(n).padStart(2, '0');

/** "ter, 12/06 às 14:00" in the local zone. */
function rotuloSlot(iso, offsetMin = AGENDA_PADRAO.offsetMin) {
  const p = partesLocais(Date.parse(iso), offsetMin);
  return `${DIAS_ABREV[p.diaSemana]}, ${pad(p.dia)}/${pad(p.mes + 1)} às ${pad(p.hora)}:${pad(p.min)}`;
}

/**
 * WhatsApp message proposing the times (numbered, pt-BR). Empty → fallback (the
 * orchestrator escalates to a human in that case).
 * @param {string[]} slotsIso
 * @param {number} [offsetMin]
 * @returns {string}
 */
function formatarPropostaSlots(slotsIso, offsetMin = AGENDA_PADRAO.offsetMin) {
  if (slotsIso.length === 0) return 'Não achei horários livres nos próximos dias.';
  const linhas = slotsIso.map((iso, i) => `${i + 1}) ${rotuloSlot(iso, offsetMin)}`);
  return [
    'Consigo esses horários pra uma conversa rápida (30 min, online):',
    ...linhas,
    'Qual fica melhor pra você?',
    'Se nenhum desses funcionar, me fala um horário melhor pra você que eu checo aqui.',
  ].join('\n');
}

// Proposed-slots TTL: 24h. After that, re-propose (calendar may have changed).
const SLOTS_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Are the proposed slots stale? No timestamp → treat as expired (re-propose, safe
 * side). Deterministic: `agoraMs` is injected.
 * @param {string|null|undefined} propostosEmIso
 * @param {number} agoraMs
 * @param {number} [ttlMs]
 * @returns {boolean}
 */
function slotsExpirados(propostosEmIso, agoraMs, ttlMs = SLOTS_TTL_MS) {
  if (!propostosEmIso) return true;
  const t = Date.parse(propostosEmIso);
  if (Number.isNaN(t)) return true;
  return agoraMs - t > ttlMs;
}

/**
 * Validate that `escolhaIso` is EXACTLY one of the proposed times (compares the
 * instant). Anti-invention: never books a time that wasn't offered.
 * @param {string|null|undefined} escolhaIso
 * @param {string[]} propostas
 * @returns {boolean}
 */
function slotEhValido(escolhaIso, propostas) {
  if (!escolhaIso) return false;
  const t = Date.parse(escolhaIso);
  if (Number.isNaN(t)) return false;
  return propostas.some((p) => Date.parse(p) === t);
}

/**
 * @typedef {'horario_invalido'|'antecedencia'|'fim_de_semana'|'fora_horario'|'sem_rep_livre'} HorarioSugeridoMotivo
 */

/**
 * Validate a time SUGGESTED by the prospect against the same business window +
 * real free/busy used by the proposals. If it doesn't fit, we ask for another
 * time instead of forcing a fresh slot list.
 * @param {string|null|undefined} slotIso
 * @param {Record<string, BusyInterval[]>} busyByRep
 * @param {number} agoraMs
 * @param {AgendaConfig} [cfg]
 * @returns {{ok: true, iso: string, reps: string[]}|{ok: false, motivo: HorarioSugeridoMotivo, iso: string|null}}
 */
function avaliarHorarioSugerido(slotIso, busyByRep, agoraMs, cfg = AGENDA_PADRAO) {
  const start = Date.parse(slotIso || '');
  if (Number.isNaN(start)) return { ok: false, motivo: 'horario_invalido', iso: null };

  const iso = new Date(start).toISOString();
  const minInicio = agoraMs + cfg.antecedenciaMin * 60000;
  if (start < minInicio) return { ok: false, motivo: 'antecedencia', iso };

  const local = partesLocais(start, cfg.offsetMin);
  if (ehFimDeSemana(local.diaSemana)) return { ok: false, motivo: 'fim_de_semana', iso };

  const end = start + cfg.duracaoMin * 60000;
  const fim = partesLocais(end, cfg.offsetMin);
  const foraJanela =
    local.hora < cfg.horaInicio ||
    local.hora > cfg.horaFim ||
    fim.hora > cfg.horaFim ||
    (fim.hora === cfg.horaFim && fim.min > 0);
  if (foraJanela) return { ok: false, motivo: 'fora_horario', iso };

  const livres = Object.entries(busyByRep)
    .filter(([, busy]) => !sobrepoe(start, end, busy || []))
    .map(([rep]) => rep);
  if (livres.length === 0) return { ok: false, motivo: 'sem_rep_livre', iso };

  return { ok: true, iso, reps: livres };
}

function formatarHorarioIndisponivel(slotIso, offsetMin = AGENDA_PADRAO.offsetMin) {
  const quando = slotIso && !Number.isNaN(Date.parse(slotIso)) ? ` (${rotuloSlot(slotIso, offsetMin)})` : '';
  return `Esse horário${quando} não está livre pra gente. Você consegue me mandar outro horário que funcione pra você?`;
}

function semAcento(texto) {
  return String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function diaLocalSomado(agoraMs, dias, offsetMin) {
  const base = partesLocais(agoraMs, offsetMin);
  return partesLocais(msDeLocal(base.ano, base.mes, base.dia, 12, 0, offsetMin) + dias * 86400000, offsetMin);
}

function proximoDiaSemana(agoraMs, diaSemana, hora, min, cfg) {
  for (let d = 0; d <= 14; d++) {
    const dia = diaLocalSomado(agoraMs, d, cfg.offsetMin);
    if (dia.diaSemana !== diaSemana) continue;
    const candidato = msDeLocal(dia.ano, dia.mes, dia.dia, hora, min, cfg.offsetMin);
    if (candidato >= agoraMs + cfg.antecedenciaMin * 60000) return candidato;
  }
  const fallback = diaLocalSomado(agoraMs, 7, cfg.offsetMin);
  return msDeLocal(fallback.ano, fallback.mes, fallback.dia, hora, min, cfg.offsetMin);
}

function extrairHoraSugerida(texto) {
  const pm = texto.match(/\b(1[0-2]|0?[1-9])\s*(am|pm)\b/);
  if (pm) {
    const base = Number(pm[1]) % 12;
    return { hora: base + (pm[2] === 'pm' ? 12 : 0), min: 0 };
  }
  const exata = texto.match(/\b([01]?\d|2[0-3])\s*(?:h|:)\s*([0-5]\d)?\b/);
  if (exata) return { hora: Number(exata[1]), min: Number(exata[2] || 0) };
  if (/\b(manha|morning)\b/.test(texto)) return { hora: 10, min: 0 };
  if (/\b(tarde|afternoon)\b/.test(texto)) return { hora: 15, min: 0 };
  if (/\b(noite|evening)\b/.test(texto)) return { hora: 17, min: 0 };
  return null;
}

function extrairDiaSugerido(texto) {
  if (/\b(depois de amanha|day after tomorrow)\b/.test(texto)) return { tipo: 'delta', dias: 2 };
  if (/\b(amanha|tomorrow)\b/.test(texto)) return { tipo: 'delta', dias: 1 };
  if (/\b(hoje|today)\b/.test(texto)) return { tipo: 'delta', dias: 0 };
  const dias = [
    [/\b(seg|segunda|monday|mon)\b/, 1],
    [/\b(ter|terca|tuesday|tue)\b/, 2],
    [/\b(qua|quarta|wednesday|wed)\b/, 3],
    [/\b(qui|quinta|thursday|thu)\b/, 4],
    [/\b(sex|sexta|friday|fri)\b/, 5],
    [/\b(sab|sabado|saturday|sat)\b/, 6],
    [/\b(dom|domingo|sunday|sun)\b/, 0],
  ];
  const found = dias.find(([re]) => re.test(texto));
  return found ? { tipo: 'weekday', diaSemana: found[1] } : null;
}

/**
 * Parse a time suggested in free text ("terça às 15h", "amanhã de tarde") into a
 * concrete ISO. Deterministic: the date comes from rules, not an LLM guess.
 * @param {string|null|undefined} texto
 * @param {number} agoraMs
 * @param {AgendaConfig} [cfg]
 * @returns {{ok: true, iso: string}|{ok: false, motivo: 'sem_texto'|'sem_horario_claro'}}
 */
function parseHorarioSugerido(texto, agoraMs, cfg = AGENDA_PADRAO) {
  const normalizado = semAcento((texto || '').trim());
  if (!normalizado) return { ok: false, motivo: 'sem_texto' };

  const horario = extrairHoraSugerida(normalizado);
  if (!horario) return { ok: false, motivo: 'sem_horario_claro' };

  const dia = extrairDiaSugerido(normalizado);
  if (!dia) return { ok: false, motivo: 'sem_horario_claro' };

  let start;
  if (dia.tipo === 'delta') {
    const p = diaLocalSomado(agoraMs, dia.dias, cfg.offsetMin);
    start = msDeLocal(p.ano, p.mes, p.dia, horario.hora, horario.min, cfg.offsetMin);
  } else {
    start = proximoDiaSemana(agoraMs, dia.diaSemana, horario.hora, horario.min, cfg);
  }
  return { ok: true, iso: new Date(start).toISOString() };
}

function formatarHorarioSugeridoAmbiguo() {
  return 'Consigo checar sim. Me manda um dia e horário mais certinho? Pode ser tipo "terça às 15h" ou "amanhã de tarde".';
}

function formatarPedidoEmail(slotIso, offsetMin = AGENDA_PADRAO.offsetMin) {
  return `Boa, fica ${rotuloSlot(slotIso, offsetMin)} então! Qual o seu melhor e-mail pra eu te enviar o convite da agenda? Se preferir, te mando o link da call por aqui mesmo 🙂`;
}

/**
 * @typedef {{nome: string, dono_nome: string|null, cidade: string|null, whatsapp_phone: string|null, whatsapp_dono: string|null}} EventoLead
 * @typedef {{attendees?: string[], prospectEmail?: string|null, repNome?: string|null, cfg?: AgendaConfig}} EventoOpts
 */

/**
 * Google Calendar event body (events.insert) with Google Meet. `requestId` is
 * injected (deterministic for idempotency — e.g. leadId+slot). timeZone IANA
 * derived from the offset (-180 → Sao_Paulo). `opts.attendees` invites the team rep(s).
 * @param {EventoLead} lead
 * @param {string} slotIso
 * @param {string} requestId
 * @param {EventoOpts} [opts]
 */
function montarEventoCalendar(lead, slotIso, requestId, opts = {}) {
  const cfg = opts.cfg || AGENDA_PADRAO;
  const start = Date.parse(slotIso);
  const fimIso = new Date(start + cfg.duracaoMin * 60000).toISOString();
  const quem = (lead.dono_nome && lead.dono_nome.trim()) || lead.nome;
  const tz = cfg.offsetMin === -180 ? 'America/Sao_Paulo' : 'UTC';
  const attendeeEmails = [...(opts.attendees || []), opts.prospectEmail || '']
    .map((email) => String(email).trim())
    .filter((email) => email && email.includes('@'));
  const attendees = [...new Set(attendeeEmails)].map((email) => ({ email }));
  const repNome = opts.repNome && opts.repNome.trim();
  const ev = {
    summary: repNome ? `${quem} <> ${repNome}` : `${COMPANY} × ${lead.nome}`,
    description: [
      `Conversa de apresentação da ${COMPANY} com ${quem}` + (lead.cidade ? ` (${lead.cidade})` : ''),
      `Agendada automaticamente pela ${AGENT_NAME} via WhatsApp.`,
      repNome ? `Responsável ${COMPANY}: ${repNome}` : '',
      opts.prospectEmail && opts.prospectEmail.trim() ? `Convite enviado para: ${opts.prospectEmail.trim()}` : '',
      (lead.whatsapp_dono && lead.whatsapp_dono.trim()) || lead.whatsapp_phone
        ? `WhatsApp: ${(lead.whatsapp_dono && lead.whatsapp_dono.trim()) || lead.whatsapp_phone}`
        : '',
    ].filter(Boolean).join('\n'),
    start: { dateTime: slotIso, timeZone: tz },
    end: { dateTime: fimIso, timeZone: tz },
    conferenceData: {
      createRequest: { requestId, conferenceSolutionKey: { type: 'hangoutsMeet' } },
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 60 },
        { method: 'email', minutes: 60 },
      ],
    },
  };
  if (attendees.length) ev.attendees = attendees;
  return ev;
}

/** ISO of a slot, whether a string (legacy) or {iso, reps} (multi-rep). */
function extrairIso(slot) {
  if (!slot) return null;
  return typeof slot === 'string' ? slot : slot.iso;
}

// Stable string → non-negative int (no Math.random — deterministic).
function hashInt(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Pick ONE free rep for the slot, distributing across leads stably (lead hash).
 * @param {string[]} repsLivres
 * @param {string} chaveLead
 * @returns {string|null}
 */
function escolherRep(repsLivres, chaveLead) {
  if (!repsLivres || repsLivres.length === 0) return null;
  return repsLivres[hashInt(chaveLead) % repsLivres.length];
}

/**
 * Pick the free rep with the FEWEST future meetings (real load balancing).
 * `loadByRep` = future-meeting count per email (absent rep = 0). Tie on min load
 * → deterministic hash tiebreak (same lead → same rep). No free reps → null.
 * @param {string[]} repsLivres
 * @param {Record<string, number>} loadByRep
 * @param {string} chaveLead
 * @returns {string|null}
 */
function escolherRepBalanceado(repsLivres, loadByRep, chaveLead) {
  if (!repsLivres || repsLivres.length === 0) return null;
  const carga = (r) => loadByRep[r] || 0;
  const minCarga = Math.min(...repsLivres.map(carga));
  const empatados = repsLivres.filter((r) => carga(r) === minCarga);
  return empatados[hashInt(chaveLead) % empatados.length];
}

/** Post-booking confirmation message (with the Meet link). */
function formatarConfirmacao(slotIso, meetLink, offsetMin = AGENDA_PADRAO.offsetMin, prospectEmail) {
  const quando = rotuloSlot(slotIso, offsetMin);
  const invite = prospectEmail && prospectEmail.trim() ? ` Enviei o convite para ${prospectEmail.trim()}.` : '';
  const base = `Marcado! ${quando}.${invite} Vou te mandar um lembrete antes 🙂`;
  return meetLink ? `${base}\nLink da call: ${meetLink}` : base;
}

module.exports = {
  AGENDA_PADRAO,
  SLOTS_TTL_MS,
  proporSlots,
  proporSlotsMulti,
  parseJanelaInicio,
  rotuloSlot,
  formatarPropostaSlots,
  slotsExpirados,
  slotEhValido,
  avaliarHorarioSugerido,
  formatarHorarioIndisponivel,
  parseHorarioSugerido,
  formatarHorarioSugeridoAmbiguo,
  formatarPedidoEmail,
  montarEventoCalendar,
  extrairIso,
  escolherRep,
  escolherRepBalanceado,
  formatarConfirmacao,
};
