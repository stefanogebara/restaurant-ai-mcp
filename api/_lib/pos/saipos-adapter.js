/**
 * Adaptador de LEITURA da Saipos Order API.
 *
 * Origem: spike `saipos-portao` (docs/intel/BACKLOG.md), fechado em 2026-08-25
 * com a rota confirmada viva contra a loja de teste. Este é o primeiro POS
 * brasileiro do repo — até aqui o enum de `pos_provider` era inteiramente
 * americano e nenhum dos provedores operava em São Paulo, que é o público-alvo.
 *
 * SÓ LEITURA, e isso é uma decisão, não uma limitação temporária. A Order API
 * tem `solicitar-fechamento-mesa`, e ele NÃO registra pagamento: apenas pinta a
 * mesa de laranja avisando o garçom que o cliente pediu a conta (confirmado na
 * doc e no sandbox, ver o teardown de 2026-07-27). Um adaptador que expusesse
 * isso como "fechar conta" viraria promessa quebrada na implantação. Enquanto
 * não houver caminho real de baixa de pagamento, este arquivo não escreve nada.
 *
 * ── Autenticação ────────────────────────────────────────────────────────────
 * A doc pública NÃO documenta a rota de auth. `criar-pedido` manda "informe o
 * token gerado na rota de autenticação" e nenhuma página diz qual é. O fluxo
 * real, descoberto sondando em 2026-08-25:
 *
 *   POST /auth  { "idPartner": "...", "secret": "..." }  →  { "token": "<JWT>" }
 *   depois:     Authorization: <JWT>     (CRU, sem prefixo Bearer)
 *
 * O JWT vale 48h. O token é cacheado em processo e re-emitido com margem —
 * autenticar a cada chamada seria desperdício e ruído no rate limit deles.
 *
 * ── Três armadilhas que o adaptador neutraliza ──────────────────────────────
 * 1. camelCase no corpo do /auth. `id_partner` em snake_case devolve 400 com a
 *    MESMA mensagem de credencial inválida, então o erro de grafia se disfarça
 *    de credencial errada.
 * 2. Array vazio É SUCESSO em `/sale-status-by-table-or-pad` — mesa livre
 *    devolve `[]`. Tratar isso como falha é ler "rota morta" numa rota viva.
 * 3. HTTP 404 + errorCode 946 em `/order-cards` É ESTADO VAZIO — significa
 *    "restaurante não tem comandas cadastradas", não erro. Confirmado no
 *    sandbox, onde a loja de teste devolve exatamente isso.
 */

const { createSecureLogger } = require('../secure-logger');

const logger = createSecureLogger('saipos-adapter');

const DEFAULT_BASE_URL = 'https://order-api.saipos.com';
const DEFAULT_TIMEOUT_MS = 15000;
/** Re-emite o JWT com 5 min de folga em vez de esperar expirar em voo. */
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

/** Códigos de erro da Saipos que têm significado além de "deu ruim". */
const ERROR_CODES = {
  INTERNAL: 900,
  AUTH_INVALID: 901,       // token inválido ou expirado
  VALIDATION: 902,         // corpo do /auth malformado — inclui grafia errada
  STORE_TOKEN_EXPIRED: 917,
  NO_ORDER_CARDS: 946,     // NÃO é erro: nenhuma comanda cadastrada
  CONTINGENCY: 950,        // PDV em modo contingência, GETs bloqueados
};

class SaiposError extends Error {
  constructor(message, { status, errorCode, guidRequest } = {}) {
    super(message);
    this.name = 'SaiposError';
    this.status = status ?? null;
    this.errorCode = errorCode ?? null;
    /** A Saipos devolve um guid por requisição — é o que o suporte deles pede. */
    this.guidRequest = guidRequest ?? null;
    this.isAuth = errorCode === ERROR_CODES.AUTH_INVALID
      || errorCode === ERROR_CODES.STORE_TOKEN_EXPIRED;
    this.isContingency = errorCode === ERROR_CODES.CONTINGENCY;
  }
}

/**
 * `?table=[5]` leva COLCHETES LITERAIS, um valor por chamada. Não é
 * `?table=5` nem `?table[]=5`, e `encodeURIComponent` viraria `%5B5%5D`, que o
 * endpoint recusa — por isso a query é montada à mão. Formato descoberto
 * sondando o sandbox; a doc induz ao erro.
 */
function bracketQuery(param, value) {
  return `${param}=[${String(value)}]`;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Cliente da Order API para um restaurante.
 *
 * @param {object} opts
 * @param {string} opts.idPartner  "Id Partner" do painel developer.saipos.com
 * @param {string} opts.secret     chave do painel (trocada pelo JWT)
 * @param {string} [opts.baseUrl]  default order-api.saipos.com — o painel mostra
 *                                 esta mesma URL para a loja de teste: NÃO existe
 *                                 host de sandbox separado, o que muda é a loja
 * @param {Function} [opts.fetchImpl] injetável para teste
 * @param {Function} [opts.now]       injetável para teste do cache de token
 */
function createSaiposClient({
  idPartner,
  secret,
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (!idPartner || !secret) {
    throw new SaiposError('saipos: idPartner e secret são obrigatórios');
  }

  const base = baseUrl.replace(/\/+$/, '');
  let cached = null; // { token, expiresAtMs }

  async function request(path, { method = 'GET', body, token } = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    let text;
    try {
      res = await fetchImpl(`${base}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          // Authorization recebe o JWT CRU. Bearer não é aceito.
          ...(token ? { Authorization: token } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: ctrl.signal,
      });
      text = await res.text();
    } catch (err) {
      throw new SaiposError(
        err.name === 'AbortError'
          ? `saipos: timeout de ${timeoutMs}ms em ${path}`
          : `saipos: falha de rede em ${path}: ${err.message}`,
      );
    } finally {
      clearTimeout(timer);
    }
    return { res, text, data: parseJson(text) };
  }

  /** Troca idPartner + secret por um JWT. camelCase é obrigatório. */
  async function issueToken() {
    const { res, text, data } = await request('/auth', {
      method: 'POST',
      body: { idPartner, secret },
    });
    if (res.status !== 200 || !data?.token) {
      throw new SaiposError(
        `saipos: /auth devolveu HTTP ${res.status}: ${data?.errorMessage || text.slice(0, 160)}`,
        { status: res.status, errorCode: data?.errorCode, guidRequest: data?.guidRequest },
      );
    }
    // O exp do JWT é a fonte da verdade; o "2 dias" do FAQ é só a expectativa.
    let expiresAtMs = now() + 24 * 60 * 60 * 1000;
    try {
      const payload = JSON.parse(Buffer.from(data.token.split('.')[1], 'base64').toString());
      if (payload?.exp) expiresAtMs = payload.exp * 1000;
    } catch {
      logger.warn('saipos: não consegui ler o exp do JWT, usando 24h conservador');
    }
    return { token: data.token, expiresAtMs };
  }

  async function getToken() {
    if (cached && cached.expiresAtMs - now() > TOKEN_REFRESH_MARGIN_MS) {
      return cached.token;
    }
    cached = await issueToken();
    return cached.token;
  }

  /** Uma tentativa de re-auth quando o token cacheado é recusado em voo. */
  async function authed(path) {
    let token = await getToken();
    let out = await request(path, { token });
    if (out.res.status === 401 && out.data?.errorCode === ERROR_CODES.AUTH_INVALID) {
      cached = null;
      token = await getToken();
      out = await request(path, { token });
    }
    return out;
  }

  return {
    /**
     * Estado de venda de UMA mesa. Array vazio = mesa livre, e isso é sucesso.
     * @returns {Promise<Array>} entradas cruas da Saipos
     */
    async getSaleStatusByTable(table) {
      const { res, text, data } = await authed(
        `/sale-status-by-table-or-pad?${bracketQuery('table', table)}`,
      );
      if (res.status === 200 && Array.isArray(data)) return data;
      throw new SaiposError(
        `saipos: consulta de mesa ${table} devolveu HTTP ${res.status}: ${data?.errorMessage || text.slice(0, 160)}`,
        { status: res.status, errorCode: data?.errorCode, guidRequest: data?.guidRequest },
      );
    },

    /** Idem para comanda. Array vazio = comanda livre. */
    async getSaleStatusByPad(pad) {
      const { res, text, data } = await authed(
        `/sale-status-by-table-or-pad?${bracketQuery('pad', pad)}`,
      );
      if (res.status === 200 && Array.isArray(data)) return data;
      throw new SaiposError(
        `saipos: consulta de comanda ${pad} devolveu HTTP ${res.status}: ${data?.errorMessage || text.slice(0, 160)}`,
        { status: res.status, errorCode: data?.errorCode, guidRequest: data?.guidRequest },
      );
    },

    /**
     * Lista as comandas do restaurante.
     *
     * HTTP 404 com errorCode 946 é ESTADO VAZIO, não erro — quer dizer que a
     * casa não tem comanda cadastrada, que é o caso de todo restaurante que só
     * trabalha por mesa. Confirmado no sandbox. Devolve lista vazia.
     */
    async listOrderCards() {
      const { res, text, data } = await authed('/order-cards');
      if (res.status === 200 && data) {
        return { padMode: data.pad_mode ?? null, pads: data.pads ?? [] };
      }
      if (res.status === 404 && data?.errorCode === ERROR_CODES.NO_ORDER_CARDS) {
        return { padMode: null, pads: [] };
      }
      throw new SaiposError(
        `saipos: /order-cards devolveu HTTP ${res.status}: ${data?.errorMessage || text.slice(0, 160)}`,
        { status: res.status, errorCode: data?.errorCode, guidRequest: data?.guidRequest },
      );
    },

    /** Garçons cadastrados na loja. */
    async listWaiters() {
      const { res, text, data } = await authed('/waiters');
      if (res.status === 200 && Array.isArray(data)) return data;
      throw new SaiposError(
        `saipos: /waiters devolveu HTTP ${res.status}: ${data?.errorMessage || text.slice(0, 160)}`,
        { status: res.status, errorCode: data?.errorCode, guidRequest: data?.guidRequest },
      );
    },

    /** Exposto para teste do cache; não faz parte do contrato de uso. */
    _tokenState: () => (cached ? { ...cached } : null),
  };
}

/**
 * Normaliza uma entrada de `/sale-status-by-table-or-pad`.
 *
 * `id_table_order_status` é devolvido CRU de propósito: a doc da Saipos não
 * publica o significado dos códigos numéricos desse campo em lugar nenhum
 * (o enum documentado — OPEN / IN_USE / CLOSING_REQUESTED — é de OUTRO
 * endpoint, o de status de comanda). Inventar um mapeamento aqui seria criar
 * semântica que ninguém confirmou. Quando a Saipos documentar, ou quando
 * observarmos os códigos numa loja real, isto vira um enum de verdade.
 */
function normalizeSaleStatus(raw) {
  return {
    table: raw.table ?? null,
    pad: raw.pad ?? null,
    orderId: raw.order_id ?? null,   // ausente em pedido criado manualmente no PDV
    saleId: raw.id_partner_sale ?? null,
    rawStatusCode: raw.id_table_order_status ?? null,
  };
}

/** Uma mesa está ocupada quando a consulta devolve qualquer venda. */
function isTableOccupied(entries) {
  return Array.isArray(entries) && entries.length > 0;
}

module.exports = {
  createSaiposClient,
  normalizeSaleStatus,
  isTableOccupied,
  SaiposError,
  ERROR_CODES,
};
