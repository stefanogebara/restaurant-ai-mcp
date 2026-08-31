/**
 * Cada asserção aqui corresponde a um comportamento OBSERVADO contra o sandbox
 * da Saipos em 2026-08-25, não à documentação — que errou em três pontos no
 * mesmo dia. As respostas usadas como fixture são cópias das reais.
 */

const {
  createSaiposClient,
  normalizeSaleStatus,
  isTableOccupied,
  SaiposError,
  ERROR_CODES,
} = require('../_lib/pos/saipos-adapter');

// JWT real em forma: header.payload.signature, payload com exp em segundos.
function makeJwt(expSeconds) {
  const payload = Buffer.from(JSON.stringify({
    idPartner: 'fde34c6feb1e00cfdf8b5067ebf2e3fb',
    exp: expSeconds,
  })).toString('base64');
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.sig`;
}

/** Encadeia respostas e grava o que foi pedido, para inspecionar depois. */
function mockFetch(responses) {
  const calls = [];
  const impl = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', headers: init.headers || {}, body: init.body });
    const next = responses.shift();
    if (!next) throw new Error(`mockFetch sem resposta para ${url}`);
    return {
      status: next.status,
      text: async () => (typeof next.body === 'string' ? next.body : JSON.stringify(next.body)),
    };
  };
  impl.calls = calls;
  return impl;
}

const NOW = 1787677000000;
const creds = { idPartner: 'partner-abc', secret: 'secret-xyz' };
const okAuth = { status: 200, body: { token: makeJwt(Math.floor(NOW / 1000) + 48 * 3600) } };

describe('saipos: autenticação', () => {
  it('manda idPartner e secret em camelCase — snake_case é recusado pela API', async () => {
    const fetchImpl = mockFetch([okAuth, { status: 200, body: [] }]);
    const c = createSaiposClient({ ...creds, fetchImpl, now: () => NOW });
    await c.getSaleStatusByTable(5);

    const auth = fetchImpl.calls[0];
    expect(auth.method).toBe('POST');
    expect(auth.url).toMatch(/\/auth$/);
    const sent = JSON.parse(auth.body);
    expect(sent).toEqual({ idPartner: 'partner-abc', secret: 'secret-xyz' });
    // A grafia snake_case devolve 400 com a MESMA mensagem de credencial
    // inválida, então este teste é o que impede alguém de "consertar" o corpo.
    expect(sent.id_partner).toBeUndefined();
  });

  it('manda o JWT cru no Authorization, sem prefixo Bearer', async () => {
    const fetchImpl = mockFetch([okAuth, { status: 200, body: [] }]);
    const c = createSaiposClient({ ...creds, fetchImpl, now: () => NOW });
    await c.getSaleStatusByTable(5);

    const authHeader = fetchImpl.calls[1].headers.Authorization;
    expect(authHeader).toBe(okAuth.body.token);
    expect(authHeader).not.toMatch(/^Bearer /);
  });

  it('reaproveita o token entre chamadas em vez de reautenticar', async () => {
    const fetchImpl = mockFetch([okAuth, { status: 200, body: [] }, { status: 200, body: [] }]);
    const c = createSaiposClient({ ...creds, fetchImpl, now: () => NOW });
    await c.getSaleStatusByTable(1);
    await c.getSaleStatusByTable(2);

    const auths = fetchImpl.calls.filter((c2) => c2.url.endsWith('/auth'));
    expect(auths).toHaveLength(1);
  });

  it('re-emite o token quando ele ENVELHECE até a margem, entre chamadas', async () => {
    // Token de 10 min. Primeira chamada usa; depois o relógio avança para
    // dentro da margem de 5 min e a segunda chamada precisa re-emitir.
    const curto = { status: 200, body: { token: makeJwt(Math.floor(NOW / 1000) + 600) } };
    const fetchImpl = mockFetch([
      curto, { status: 200, body: [] },   // 1a chamada: emite + consulta
      okAuth, { status: 200, body: [] },  // 2a chamada: re-emite + consulta
    ]);
    let relogio = NOW;
    const c = createSaiposClient({ ...creds, fetchImpl, now: () => relogio });

    await c.getSaleStatusByTable(1);
    expect(fetchImpl.calls.filter((c2) => c2.url.endsWith('/auth'))).toHaveLength(1);

    relogio = NOW + 7 * 60 * 1000; // faltam 3 min para expirar → dentro da margem
    await c.getSaleStatusByTable(2);
    expect(fetchImpl.calls.filter((c2) => c2.url.endsWith('/auth'))).toHaveLength(2);
  });

  it('NÃO re-emite em laço um token recém-nascido já dentro da margem', async () => {
    // Se o servidor devolvesse sempre um token curto, re-emitir na hora viraria
    // laço infinito. O adaptador usa o token que acabou de receber.
    const nasceCurto = { status: 200, body: { token: makeJwt(Math.floor(NOW / 1000) + 60) } };
    const fetchImpl = mockFetch([nasceCurto, { status: 200, body: [] }]);
    const c = createSaiposClient({ ...creds, fetchImpl, now: () => NOW });
    await expect(c.getSaleStatusByTable(1)).resolves.toEqual([]);
    expect(fetchImpl.calls.filter((c2) => c2.url.endsWith('/auth'))).toHaveLength(1);
  });

  it('reautentica uma vez quando o token cacheado é recusado em voo', async () => {
    const recusa = {
      status: 401,
      body: { type: 'sale-status-by-table-or-pad', errorCode: 901, errorMessage: 'Token inválido ou expirado.' },
    };
    const fetchImpl = mockFetch([okAuth, recusa, okAuth, { status: 200, body: [] }]);
    const c = createSaiposClient({ ...creds, fetchImpl, now: () => NOW });
    await expect(c.getSaleStatusByTable(5)).resolves.toEqual([]);
    expect(fetchImpl.calls.filter((c2) => c2.url.endsWith('/auth'))).toHaveLength(2);
  });

  it('exige idPartner e secret', () => {
    expect(() => createSaiposClient({ idPartner: 'x' })).toThrow(SaiposError);
  });
});

describe('saipos: formato da query de mesa', () => {
  it('usa colchetes LITERAIS, sem percent-encoding', async () => {
    const fetchImpl = mockFetch([okAuth, { status: 200, body: [] }]);
    const c = createSaiposClient({ ...creds, fetchImpl, now: () => NOW });
    await c.getSaleStatusByTable(5);

    const url = fetchImpl.calls[1].url;
    expect(url).toContain('table=[5]');
    expect(url).not.toContain('%5B');
    expect(url).not.toContain('table[]=');
  });
});

describe('saipos: array vazio é SUCESSO', () => {
  it('mesa livre devolve [] e isso não é erro', async () => {
    const fetchImpl = mockFetch([okAuth, { status: 200, body: [] }]);
    const c = createSaiposClient({ ...creds, fetchImpl, now: () => NOW });
    await expect(c.getSaleStatusByTable(5)).resolves.toEqual([]);
  });

  it('isTableOccupied separa mesa livre de mesa com venda', () => {
    expect(isTableOccupied([])).toBe(false);
    expect(isTableOccupied([{ table: '20' }])).toBe(true);
    expect(isTableOccupied(null)).toBe(false);
  });
});

describe('saipos: 946 em /order-cards é estado vazio, não erro', () => {
  it('devolve lista vazia quando a casa não tem comanda cadastrada', async () => {
    // Resposta REAL da loja de teste em 2026-08-26.
    const semComandas = {
      status: 404,
      body: {
        type: 'order-cards',
        errorCode: 946,
        errorMessage: 'Restaurante não possui comandas cadastradas.',
        guidRequest: 'c309aede-a8eb-4eea-81db-44c940fc2bea',
      },
    };
    const fetchImpl = mockFetch([okAuth, semComandas]);
    const c = createSaiposClient({ ...creds, fetchImpl, now: () => NOW });
    await expect(c.listOrderCards()).resolves.toEqual({ padMode: null, pads: [] });
  });

  it('mas 404 por outro motivo continua sendo erro', async () => {
    const fetchImpl = mockFetch([okAuth, { status: 404, body: 'Not Found' }]);
    const c = createSaiposClient({ ...creds, fetchImpl, now: () => NOW });
    await expect(c.listOrderCards()).rejects.toThrow(SaiposError);
  });

  it('devolve as comandas quando existem', async () => {
    const comandas = {
      status: 200,
      body: { pad_mode: 'MANUAL', pads: [{ order_card: '12', enabled: true, have_open_sales: 'N' }] },
    };
    const fetchImpl = mockFetch([okAuth, comandas]);
    const c = createSaiposClient({ ...creds, fetchImpl, now: () => NOW });
    await expect(c.listOrderCards()).resolves.toEqual({
      padMode: 'MANUAL',
      pads: [{ order_card: '12', enabled: true, have_open_sales: 'N' }],
    });
  });
});

describe('saipos: erros carregam o que o suporte pede', () => {
  it('marca erro de auth e guarda o guidRequest', async () => {
    const recusa = {
      status: 401,
      body: { errorCode: 901, errorMessage: 'Token inválido ou expirado.', guidRequest: 'abc-123' },
    };
    // Duas recusas: a primeira dispara a reautenticação, a segunda estoura.
    const fetchImpl = mockFetch([okAuth, recusa, okAuth, recusa]);
    const c = createSaiposClient({ ...creds, fetchImpl, now: () => NOW });
    await expect(c.getSaleStatusByTable(5)).rejects.toMatchObject({
      name: 'SaiposError',
      isAuth: true,
      errorCode: 901,
      guidRequest: 'abc-123',
    });
  });

  it('distingue modo de contingência de credencial ruim', async () => {
    const contingencia = {
      status: 400,
      body: { errorCode: 950, errorMessage: 'Sistema está em modo Contingência.' },
    };
    const fetchImpl = mockFetch([okAuth, contingencia]);
    const c = createSaiposClient({ ...creds, fetchImpl, now: () => NOW });
    await expect(c.getSaleStatusByTable(5)).rejects.toMatchObject({
      isContingency: true,
      isAuth: false,
    });
  });

  it('falha do /auth não vira falha de consulta', async () => {
    const authRuim = {
      status: 400,
      body: { type: 'auth', errorCode: 902, errorMessage: 'Id do parceiro ou secret inválidos!' },
    };
    const fetchImpl = mockFetch([authRuim]);
    const c = createSaiposClient({ ...creds, fetchImpl, now: () => NOW });
    await expect(c.getSaleStatusByTable(5)).rejects.toThrow(/\/auth devolveu HTTP 400/);
  });
});

describe('saipos: normalização', () => {
  it('mapeia a entrada real e mantém o código de status CRU', () => {
    // Exemplo da própria doc da Saipos.
    const out = normalizeSaleStatus({
      table: '20', pad: '45', order_id: '1678716468',
      id_partner_sale: 28, id_table_order_status: 2,
    });
    expect(out).toEqual({
      table: '20', pad: '45', orderId: '1678716468', saleId: 28, rawStatusCode: 2,
    });
    // O enum numérico NÃO é documentado em lugar nenhum — o adaptador não
    // inventa significado. Se alguém traduzir isso para 'ocupada'/'livre' sem
    // fonte, este teste é o lugar onde a decisão precisa ser revista.
    expect(out.rawStatusCode).toBe(2);
  });

  it('aguenta pedido criado manualmente no PDV, que não tem order_id', () => {
    expect(normalizeSaleStatus({ table: '7' })).toEqual({
      table: '7', pad: null, orderId: null, saleId: null, rawStatusCode: null,
    });
  });
});

describe('saipos: o adaptador não escreve', () => {
  it('não expõe nenhuma operação de escrita', () => {
    const c = createSaiposClient({ ...creds, fetchImpl: mockFetch([]), now: () => NOW });
    const nomes = Object.keys(c);
    // solicitar-fechamento-mesa muda estado (pinta a mesa de laranja para o
    // garçom) e NÃO registra pagamento. Fica fora por decisão.
    expect(nomes.some((n) => /close|fechar|finish|write|create|post/i.test(n))).toBe(false);
    expect(nomes).toEqual(
      expect.arrayContaining(['getSaleStatusByTable', 'getSaleStatusByPad', 'listOrderCards', 'listWaiters']),
    );
  });
});

describe('saipos: constantes', () => {
  it('mantém os códigos que têm significado', () => {
    expect(ERROR_CODES.AUTH_INVALID).toBe(901);
    expect(ERROR_CODES.NO_ORDER_CARDS).toBe(946);
    expect(ERROR_CODES.CONTINGENCY).toBe(950);
  });
});
