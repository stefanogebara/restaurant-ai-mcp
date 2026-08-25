'use strict';

/**
 * O portão por onde TODA escrita do onboarding em conversa passa.
 *
 * O risco 3 do spike da G5: um LLM escrevendo direto num schema com restrições
 * duras. `restaurant_type` é enum do Postgres (dez valores); `city`,
 * `country`, `email`, `phone`, `restaurant_name` são NOT NULL sem default;
 * `business_hours` tem dois formatos circulando no repo. Um erro de PGRST no
 * meio da conversa é o pior lugar possível para falhar — o dono está olhando.
 *
 * Duas responsabilidades, e a segunda é mais importante que a primeira:
 *
 * 1. **Coagir.** "Pizzaria" vira `italian`, horários viram o formato canônico,
 *    espaço em branco some. O que não dá para coagir vira erro EM PROSA, que o
 *    modelo lê como tool_result e usa para perguntar de novo — em vez de uma
 *    stack trace do Postgres.
 *
 * 2. **Barrar.** Só os campos da allowlist chegam ao banco. Isto não é higiene,
 *    é fronteira de segurança: este agente vai digerir texto RASPADO da web —
 *    site do restaurante, cardápio em PDF, avaliações — e o autor daquele texto
 *    não é o dono do restaurante. Uma instrução plantada numa página que
 *    convença o modelo a chamar `gravar({ user_id: '...' })` ou
 *    `gravar({ is_demo: false })` tem que morrer AQUI, não no banco. É a mesma
 *    lição do #75, onde o extrator concatenava texto de terceiros dentro das
 *    instruções.
 *
 * Por isso a allowlist é positiva (o que PODE) e nunca negativa (o que não
 * pode): campo novo no schema nasce barrado, e a decisão de liberá-lo é
 * explícita.
 */

const { normalizeRestaurantType } = require('./restaurant-type');

const DIAS = Object.freeze([
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
]);

/** Campos que a conversa NUNCA pode tocar, com o motivo. Só para a mensagem
 *  de erro ser útil — a proteção real é a allowlist não os conter. */
const PROIBIDOS_CONHECIDOS = Object.freeze({
  id: 'identidade da linha',
  user_id: 'dono da conta',
  is_demo: 'natureza da linha (demo vs. real)',
  demo_token: 'credencial de acesso ao demo',
  demo_expires_at: 'validade do demo',
  demo_converted_at: 'marca de conversão',
  onboarding_completed: 'estado do fluxo',
  is_active: 'estado da conta',
  slug: 'endereço público',
  created_at: 'auditoria',
  updated_at: 'auditoria',
});

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RE_HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

function textoObrigatorio(campo, max = 255) {
  return (v) => {
    if (typeof v !== 'string' || !v.trim()) {
      return { erro: `${campo} não pode ficar vazio` };
    }
    const limpo = v.trim().replace(/\s+/g, ' ');
    if (limpo.length > max) return { erro: `${campo} passa de ${max} caracteres` };
    return { valor: limpo };
  };
}

/**
 * Horários. Dois formatos circulam no repo: o canônico do banco
 * (`is_open`/`open_time`/`close_time`) e um abreviado (`open`/`close`) que já
 * custou meses de prefill silenciosamente ignorado (achado da G4). Aceita os
 * dois na entrada e SEMPRE devolve o canônico.
 */
function coagirHorarios(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    return { erro: 'horários precisam vir como objeto com um dia por chave' };
  }
  const saida = {};
  const problemas = [];

  for (const [chave, bruto] of Object.entries(v)) {
    const dia = String(chave).toLowerCase();
    if (!DIAS.includes(dia)) {
      problemas.push(`"${chave}" não é dia da semana (use ${DIAS.join(', ')})`);
      continue;
    }
    if (bruto === null || bruto === false) {
      saida[dia] = { is_open: false, open_time: '00:00', close_time: '00:00' };
      continue;
    }
    if (typeof bruto !== 'object') {
      problemas.push(`${dia}: esperava { open_time, close_time } ou fechado`);
      continue;
    }
    const abre = bruto.open_time ?? bruto.open;
    const fecha = bruto.close_time ?? bruto.close;
    // is_open ausente com horário presente significa aberto — é o caso comum
    // vindo de scraping, onde ninguém escreve "estou aberto".
    const aberto = bruto.is_open ?? bruto.isOpen ?? Boolean(abre && fecha);

    if (!aberto) {
      saida[dia] = { is_open: false, open_time: '00:00', close_time: '00:00' };
      continue;
    }
    if (!RE_HORA.test(String(abre)) || !RE_HORA.test(String(fecha))) {
      problemas.push(`${dia}: horário precisa ser HH:MM em 24h (veio "${abre}"–"${fecha}")`);
      continue;
    }
    saida[dia] = { is_open: true, open_time: String(abre), close_time: String(fecha) };
  }

  if (problemas.length) return { erro: problemas.join('; ') };
  if (!Object.keys(saida).length) return { erro: 'nenhum dia válido nos horários' };
  return { valor: saida };
}

/**
 * A allowlist. Cada entrada é um coersor `(v) => {valor} | {erro}`.
 * O que não está aqui não chega ao banco.
 */
const CAMPOS_ESCREVIVEIS = Object.freeze({
  restaurant_name: textoObrigatorio('o nome do restaurante'),
  city: textoObrigatorio('a cidade'),
  country: textoObrigatorio('o país', 64),
  website: (v) => {
    if (v === null || v === '') return { valor: null };
    if (typeof v !== 'string') return { erro: 'o site precisa ser texto' };
    const limpo = v.trim();
    if (!/^https?:\/\/\S+$/i.test(limpo)) return { erro: 'o site precisa começar com http:// ou https://' };
    return { valor: limpo };
  },

  email: (v) => {
    const base = textoObrigatorio('o e-mail')(v);
    if (base.erro) return base;
    const limpo = base.valor.toLowerCase();
    if (!RE_EMAIL.test(limpo)) return { erro: `"${limpo}" não parece um e-mail` };
    // O placeholder que o demo grava para satisfazer o NOT NULL. Deixá-lo
    // atravessar para a conta real significa um dono sem e-mail de contato —
    // sem confirmação de reserva, sem recuperação de conta.
    if (limpo.endsWith('@demo.seatable.one')) {
      return { erro: 'esse é o e-mail temporário do demo; peça o e-mail real do dono' };
    }
    return { valor: limpo };
  },

  phone: (v) => {
    const base = textoObrigatorio('o telefone', 32)(v);
    if (base.erro) return base;
    // Guarda a forma que o dono reconhece; só exige dígitos suficientes para
    // ser discável. Normalização para E.164 é assunto de quem envia.
    const digitos = base.valor.replace(/\D/g, '');
    if (digitos.length < 8) return { erro: `"${base.valor}" tem dígitos de menos para um telefone` };
    return { valor: base.valor };
  },

  // Enum do Postgres: gravar fora da lista é erro de TIPO, não valor ignorado.
  // Por isso aqui coage em vez de recusar — "Pizzaria" tem que virar algo.
  restaurant_type: (v) => {
    if (typeof v !== 'string' || !v.trim()) return { erro: 'o tipo de restaurante não pode ficar vazio' };
    return { valor: normalizeRestaurantType(v) };
  },

  timezone: (v) => {
    if (typeof v !== 'string' || !v.trim()) return { erro: 'o fuso não pode ficar vazio' };
    const limpo = v.trim();
    try {
      new Intl.DateTimeFormat('en', { timeZone: limpo });
    } catch {
      return { erro: `"${limpo}" não é um fuso IANA válido (ex.: America/Sao_Paulo)` };
    }
    return { valor: limpo };
  },

  agent_language: (v) => {
    const idiomas = ['pt', 'es', 'en'];
    const limpo = String(v || '').toLowerCase().slice(0, 2);
    if (!idiomas.includes(limpo)) return { erro: `idioma precisa ser um de ${idiomas.join(', ')}` };
    return { valor: limpo };
  },

  business_hours: coagirHorarios,

  average_dining_duration_minutes: (v) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 15 || n > 480) {
      return { erro: 'a duração média precisa ser um número inteiro de minutos entre 15 e 480' };
    }
    return { valor: n };
  },
});

/**
 * Valida um patch proposto pela conversa.
 *
 * @param {object} bruto  o que o modelo pediu para gravar
 * @returns {{ok: boolean, patch: object, erros: string[], barrados: string[]}}
 *   `erros` é prosa para o modelo ler e reagir, não para o usuário.
 */
function validarPatch(bruto) {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) {
    return { ok: false, patch: {}, erros: ['esperava um objeto de campos para gravar'], barrados: [] };
  }

  const patch = {};
  const erros = [];
  const barrados = [];

  for (const [campo, valor] of Object.entries(bruto)) {
    const coersor = CAMPOS_ESCREVIVEIS[campo];
    if (!coersor) {
      barrados.push(campo);
      const motivo = PROIBIDOS_CONHECIDOS[campo];
      erros.push(
        motivo
          ? `"${campo}" não pode ser alterado pela conversa (${motivo})`
          : `"${campo}" não é um campo que eu saiba gravar`
      );
      continue;
    }
    const r = coersor(valor);
    if (r.erro) erros.push(r.erro);
    else patch[campo] = r.valor;
  }

  // Um patch pode ser parcialmente bom. Quem chama decide se grava o que
  // passou ou devolve tudo — mas os erros vão junto de qualquer forma, senão
  // o modelo acha que gravou o que não gravou.
  return { ok: erros.length === 0, patch, erros, barrados };
}

module.exports = {
  validarPatch,
  CAMPOS_ESCREVIVEIS,
  PROIBIDOS_CONHECIDOS,
  DIAS,
};
