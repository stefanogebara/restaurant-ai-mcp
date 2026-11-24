'use strict';

/**
 * Ciclo de vida de template sob CRON_SECRET.
 *
 * Existe porque submeter um template não era alcançável por ferramenta: o
 * endpoint que fazia isso (prospect-admin) é gated por JWT do login Google, que
 * só existe no navegador do fundador, e o token da Meta é System User guardado
 * na Vercel como Sensitive — ilegível de fora. Sem isto, criar template exige
 * um humano logado no painel.
 *
 * O invariante que estes testes protegem: template recém-submetido entra no
 * registro INATIVO. `pickTemplate` só olha a flag `active`, nunca a Meta
 * (sequencer.js:64), então registrar ativo antes da aprovação faz o dispatcher
 * escolher um template que a Meta vai recusar — foi exatamente o que a variante
 * C causou em 30/jul.
 */

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock('../_lib/secure-logger', () => ({ createSecureLogger: () => mockLogger }));

const mockDispatchIntros = jest.fn();
jest.mock('../_lib/prospecting/sequencer', () => ({
  dispatchIntros: (...a) => mockDispatchIntros(...a),
}));

const mockCreate = jest.fn();
const mockList = jest.fn();
jest.mock('../_lib/prospecting/wa-management', () => ({
  createMetaTemplate: (...a) => mockCreate(...a),
  listMetaTemplates: (...a) => mockList(...a),
}));

const mockUpsert = jest.fn();
jest.mock('../_lib/prospecting/prospect-store', () => ({
  upsertTemplate: (...a) => mockUpsert(...a),
}));

const handler = require('../prospect-dispatch');

const SEGREDO = 'segredo-de-teste';

function res() {
  return {
    statusCode: null, body: null,
    setHeader() {}, status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

const chamar = (req) => {
  const r = res();
  return handler({
    headers: { authorization: `Bearer ${SEGREDO}` },
    query: {}, body: {}, method: 'POST', ...req,
  }, r).then(() => r);
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.CRON_SECRET = SEGREDO;
  mockDispatchIntros.mockResolvedValue({ candidates: 0, sent: 0 });
  mockCreate.mockResolvedValue({ ok: true, id: '123', status: 'PENDING', name: 'olimpia_intro_c' });
  mockUpsert.mockResolvedValue({ ok: true });
  mockList.mockResolvedValue([]);
});
afterEach(() => { delete process.env.CRON_SECRET; });

describe('submissão de template', () => {
  const corpo = {
    name: 'olimpia_intro_c', body_text: 'Achei o {{1}} pelo Google',
    example_param: 'Jardim de Napoli', touch_number: 1, variant_label: 'C',
  };

  test('submete à Meta e devolve o status de revisão', async () => {
    const r = await chamar({ query: { action: 'template-create' }, body: corpo });
    expect(r.statusCode).toBe(200);
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      name: 'olimpia_intro_c', bodyText: 'Achei o {{1}} pelo Google', language: 'pt_BR',
    }));
    expect(r.body.data.status).toBe('PENDING');
  });

  test('registra INATIVO — o invariante que evita repetir o caso da C', async () => {
    await chamar({ query: { action: 'template-create' }, body: corpo });
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({
      touch_number: 1, variant_label: 'C', active: false,
    }));
  });

  test('guarda o texto submetido como body_preview (espelho fiel do que foi à Meta)', async () => {
    await chamar({ query: { action: 'template-create' }, body: corpo });
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({
      body_preview: 'Achei o {{1}} pelo Google',
    }));
  });

  test('sem touch_number, submete mas não mexe no registro', async () => {
    await chamar({
      query: { action: 'template-create' },
      body: { name: 'x', body_text: 'y' },
    });
    expect(mockCreate).toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  test('faltando name ou body_text é 400, sem chamar a Meta', async () => {
    for (const b of [{ body_text: 'y' }, { name: 'x' }, {}]) {
      mockCreate.mockClear();
      const r = await chamar({ query: { action: 'template-create' }, body: b });
      expect(r.statusCode).toBe(400);
      expect(mockCreate).not.toHaveBeenCalled();
    }
  });

  test('recusa da Meta vira 400 com o motivo, e nada é registrado', async () => {
    mockCreate.mockResolvedValue({ ok: false, error: 'nome já existe' });
    const r = await chamar({ query: { action: 'template-create' }, body: corpo });
    expect(r.statusCode).toBe(400);
    expect(r.body.error).toBe('nome já existe');
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});

describe('status ao vivo', () => {
  test('lê da Meta e resume aprovado/não aprovado', async () => {
    mockList.mockResolvedValue([
      { name: 'olimpia_intro_c', language: 'pt_BR', status: 'PENDING' },
    ]);
    const r = await chamar({
      method: 'GET', query: { action: 'template-status', name: 'olimpia_intro_c' },
    });
    expect(r.statusCode).toBe(200);
    expect(r.body.data.existe).toBe(true);
    expect(r.body.data.aprovado).toBe(false);
    expect(r.body.data.versoes).toEqual([{ language: 'pt_BR', status: 'PENDING' }]);
  });

  test('template ausente na Meta é reportado como inexistente, não como erro', async () => {
    const r = await chamar({
      method: 'GET', query: { action: 'template-status', name: 'nao_existe' },
    });
    expect(r.statusCode).toBe(200);
    expect(r.body.data.existe).toBe(false);
    expect(r.body.data.aprovado).toBe(false);
  });

  test('sem name é 400', async () => {
    const r = await chamar({ method: 'GET', query: { action: 'template-status' } });
    expect(r.statusCode).toBe(400);
  });
});

describe('as garantias antigas continuam valendo', () => {
  test('sem action, o dispatch se comporta igual (limit 0 = zero)', async () => {
    await chamar({ body: { limit: 0 } });
    expect(mockDispatchIntros).toHaveBeenCalledWith(expect.objectContaining({ limit: 0 }));
  });

  test('sem action e sem limit, default 20', async () => {
    await chamar({ body: {} });
    expect(mockDispatchIntros).toHaveBeenCalledWith(expect.objectContaining({ limit: 20 }));
  });

  test('token errado é 401 em TODAS as ações, e nada é chamado', async () => {
    for (const q of [{}, { action: 'template-create' }, { action: 'template-status', name: 'x' }]) {
      const r = res();
      await handler({
        headers: { authorization: 'Bearer errado' },
        query: q, body: { name: 'x', body_text: 'y' },
        method: q.action === 'template-status' ? 'GET' : 'POST',
      }, r);
      expect(r.statusCode).toBe(401);
    }
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockList).not.toHaveBeenCalled();
    expect(mockDispatchIntros).not.toHaveBeenCalled();
  });

  test('GET no dispatch e POST no status seguem 405', async () => {
    const a = await chamar({ method: 'GET', query: {} });
    expect(a.statusCode).toBe(405);
    const b = await chamar({ method: 'POST', query: { action: 'template-status', name: 'x' } });
    expect(b.statusCode).toBe(405);
  });
});
