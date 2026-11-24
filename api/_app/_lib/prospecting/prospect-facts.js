'use strict';

/**
 * Per-conversation knowledge base (ConversaFatos) + immutable merge + the
 * "MEMÓRIA" prompt block. Ported from olivia_brain.ts.
 *
 * ANTI-INVENTION: only stores what the LEAD actually declared — never
 * inferences. Scalars are overwritten by a new non-empty value; lists are
 * unioned (deduped). Nothing is ever deleted by a later extraction. mergeFatos
 * returns a NEW object (never mutates its arguments).
 *
 * @typedef {Object} ConversaFatos
 * @property {boolean|null} [is_dono]
 * @property {string|null} [nome_responsavel]
 * @property {string|null} [email]
 * @property {string|null} [disponibilidade]
 * @property {string[]} [objecoes]
 * @property {string[]} [interesses]
 * @property {string[]} [notas]
 *
 * Descoberta (decisão 2026-07-27: as "10 conversas" do mapa de mercado rodam
 * também dentro da prospecção — a Olímpia pergunta UMA vez, a resposta vira
 * fato estruturado e consultável, nunca anedota perdida no chat):
 * @property {'comanda_individual'|'conta_mesa'|'ambos'|null} [modelo_conta]
 * @property {string[]} [dor_pagamento]  dores DITAS sobre a hora de pagar
 * @property {string[]} [sistemas]       sistemas que o lead DISSE usar
 * @property {boolean|null} [usa_vr]     clientes pagam com vale-refeição
 * @property {boolean|null} [aceita_reserva]
 */

const FATOS_LISTAS = ['objecoes', 'interesses', 'notas', 'dor_pagamento', 'sistemas'];
const FATOS_BOOLS = ['is_dono', 'usa_vr', 'aceita_reserva'];
const MODELOS_CONTA = ['comanda_individual', 'conta_mesa', 'ambos'];

function uniqAppend(prev, novos) {
  const base = Array.isArray(prev) ? [...prev] : [];
  const vistos = new Set(base.map((s) => String(s).toLowerCase().trim()));
  const arr = Array.isArray(novos) ? novos : [];
  for (const item of arr) {
    const s = typeof item === 'string' ? item.trim() : '';
    if (!s) continue;
    const k = s.toLowerCase();
    if (!vistos.has(k)) {
      vistos.add(k);
      base.push(s);
    }
  }
  return base;
}

/**
 * Immutable merge: new non-empty scalars overwrite; lists are unioned with
 * case-insensitive dedup. Never removes existing facts. Returns a new object.
 * @param {ConversaFatos|null} prev
 * @param {ConversaFatos|null} novos
 * @returns {ConversaFatos}
 */
function mergeFatos(prev, novos) {
  const base = { ...(prev || {}) };
  for (const lista of FATOS_LISTAS) {
    const merged = uniqAppend(base[lista], novos && novos[lista]);
    if (merged.length > 0) base[lista] = merged;
    else delete base[lista];
  }
  if (novos) {
    for (const campo of FATOS_BOOLS) {
      if (typeof novos[campo] === 'boolean') base[campo] = novos[campo];
    }
    for (const campo of ['nome_responsavel', 'email', 'disponibilidade']) {
      const v = novos[campo];
      if (typeof v === 'string' && v.trim()) base[campo] = v.trim();
    }
    // Enum fechado: valor fora da lista é invenção do modelo, não fato.
    if (MODELOS_CONTA.includes(novos.modelo_conta)) base.modelo_conta = novos.modelo_conta;
  }
  return base;
}

/**
 * Render the conversation MEMORY (facts + summary) as a pt-BR prompt block.
 * Returns [] when there's no memory, so a fresh lead's prompt is unchanged.
 * @param {ConversaFatos|null} fatos
 * @param {string|null} resumo
 * @returns {string[]}
 */
function formatarMemoria(fatos, resumo) {
  const linhas = [];
  if (fatos) {
    if (fatos.is_dono === true) linhas.push('- A pessoa É o dono/responsável (confirmado nesta conversa).');
    if (fatos.nome_responsavel && fatos.nome_responsavel.trim()) linhas.push(`- Nome do responsável: ${fatos.nome_responsavel.trim()}`);
    if (fatos.email && fatos.email.trim()) linhas.push(`- E-mail informado: ${fatos.email.trim()}`);
    if (fatos.disponibilidade && fatos.disponibilidade.trim()) linhas.push(`- Disponibilidade que a pessoa deu: ${fatos.disponibilidade.trim()}`);
    if (fatos.objecoes && fatos.objecoes.length) linhas.push(`- Objeções/ressalvas já levantadas: ${fatos.objecoes.join('; ')}`);
    if (fatos.interesses && fatos.interesses.length) linhas.push(`- Interesses demonstrados: ${fatos.interesses.join('; ')}`);
    if (fatos.notas && fatos.notas.length) linhas.push(`- Outros fatos ditos: ${fatos.notas.join('; ')}`);
    // Descoberta — entra na memória pra Olímpia usar (e nunca perguntar de novo).
    if (fatos.modelo_conta === 'comanda_individual') linhas.push('- Como a casa cobra: comanda INDIVIDUAL por pessoa (cada um paga a sua no caixa).');
    if (fatos.modelo_conta === 'conta_mesa') linhas.push('- Como a casa cobra: conta única da MESA (o grupo divide na hora de pagar).');
    if (fatos.modelo_conta === 'ambos') linhas.push('- Como a casa cobra: mistura comanda individual e conta da mesa.');
    if (fatos.usa_vr === true) linhas.push('- Clientes pagam com vale-refeição (VR/Alelo/Ticket) — relevante no almoço.');
    if (fatos.usa_vr === false) linhas.push('- A casa NÃO recebe vale-refeição.');
    if (fatos.aceita_reserva === true) linhas.push('- A casa trabalha com reserva de mesa.');
    if (fatos.aceita_reserva === false) linhas.push('- A casa NÃO trabalha com reserva (fila/chegada livre).');
    if (fatos.dor_pagamento && fatos.dor_pagamento.length) linhas.push(`- Dores na hora do pagamento que a pessoa citou: ${fatos.dor_pagamento.join('; ')}`);
    if (fatos.sistemas && fatos.sistemas.length) linhas.push(`- Sistemas que a casa usa (ditos pelo lead): ${fatos.sistemas.join('; ')}`);
  }
  const resumoTxt = resumo && resumo.trim();
  if (resumoTxt) linhas.push(`- Resumo da conversa até aqui: ${resumoTxt}`);
  if (linhas.length === 0) return [];
  return [
    'MEMÓRIA DESTA CONVERSA (o que você JÁ SABE — não pergunte de novo, use com naturalidade):',
    ...linhas,
    '',
  ];
}

/** Coerce an unknown value into a safe ConversaFatos (ignores junk/wrong types). */
function coerceFatos(raw) {
  const o = raw || {};
  const out = {};
  for (const campo of FATOS_BOOLS) {
    if (typeof o[campo] === 'boolean') out[campo] = o[campo];
  }
  for (const campo of ['nome_responsavel', 'email', 'disponibilidade']) {
    const v = o[campo];
    if (typeof v === 'string' && v.trim()) out[campo] = v.trim();
  }
  if (MODELOS_CONTA.includes(o.modelo_conta)) out.modelo_conta = o.modelo_conta;
  for (const lista of FATOS_LISTAS) {
    const v = o[lista];
    if (Array.isArray(v)) {
      const arr = v.filter((x) => typeof x === 'string' && x.trim().length > 0).map((s) => s.trim());
      if (arr.length > 0) out[lista] = arr;
    }
  }
  return out;
}

module.exports = { FATOS_LISTAS, mergeFatos, formatarMemoria, coerceFatos, uniqAppend };
