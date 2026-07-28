'use strict';

/**
 * Máquina de provisionamento de número WhatsApp (item 4 zero-toque).
 *
 * O que estes testes prendem:
 *  1. o fluxo numero_proprio fala com a Graph na ordem certa e nunca vaza o PIN;
 *  2. meio-provisionado NUNCA aponta roteamento — o registry central só é
 *     escrito quando verify+register completam;
 *  3. código errado não mata a jornada (continua aguardando_codigo);
 *  4. mock é fechado por env — sem ALLOW_MOCK_WHATSAPP_PROVISIONING ninguém
 *     ativa número falso em produção;
 *  5. migração pendente vira mensagem clara, não stack trace.
 */

const mockConfigMaybeSingle = jest.fn();
const mockConfigUpdate = jest.fn();
jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    schema: () => ({
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: mockConfigMaybeSingle }) }),
        update: (payload) => ({ eq: (_col, _v) => mockConfigUpdate(payload) }),
      }),
    }),
  },
}));

const mockRegistryUpdate = jest.fn();
jest.mock('../_lib/central-supabase', () => ({
  isCentralConfigured: () => true,
  centralSupabase: {
    from: () => ({
      update: (payload) => ({
        eq: () => ({ select: () => mockRegistryUpdate(payload) }),
      }),
    }),
  },
}));

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

const {
  iniciar, confirmarCodigo, estadoPublico, ErroDeProvisionamento,
} = require('../_lib/whatsapp-provisioning');

const RID = 'rest-1';

function graphOk(sequencia) {
  // sequencia: array de corpos de resposta, na ordem das chamadas
  let i = 0;
  global.fetch = jest.fn().mockImplementation(async () => ({
    ok: true,
    json: async () => sequencia[Math.min(i++, sequencia.length - 1)],
  }));
}

const chamadasGraph = () => global.fetch.mock.calls.map(([url, opts]) => ({
  caminho: url.replace('https://graph.facebook.com/v21.0', ''),
  corpo: JSON.parse(opts.body),
}));

beforeEach(() => {
  jest.clearAllMocks();
  process.env.WHATSAPP_ACCESS_TOKEN = 'token-teste';
  process.env.WHATSAPP_WABA_ID = 'waba-teste';
  delete process.env.ALLOW_MOCK_WHATSAPP_PROVISIONING;
  mockConfigMaybeSingle.mockResolvedValue({ data: { id: RID, whatsapp_provisioning: null }, error: null });
  mockConfigUpdate.mockResolvedValue({ error: null });
  mockRegistryUpdate.mockResolvedValue({ data: [{ id: RID }], error: null });
});

describe('iniciar (numero_proprio)', () => {
  test('adiciona na WABA, pede OTP pro número do DONO, guarda estado com PIN — e não devolve o PIN', async () => {
    graphOk([{ id: 'phone-123' }, { success: true }]);
    const r = await iniciar({ restaurantId: RID, modo: 'numero_proprio', cc: '55', numero: '11 99999-8888', metodo: 'sms' });

    const g = chamadasGraph();
    expect(g[0]).toEqual({ caminho: '/waba-teste/phone_numbers', corpo: { cc: '55', phone_number: '11999998888' } });
    expect(g[1].caminho).toBe('/phone-123/request_code');
    expect(g[1].corpo.code_method).toBe('SMS');

    const gravado = mockConfigUpdate.mock.calls[0][0].whatsapp_provisioning;
    expect(gravado.estado).toBe('aguardando_codigo');
    expect(gravado.pin).toMatch(/^\d{6}$/);
    expect(gravado.numero_e164).toBe('+5511999998888');

    expect(r.estado).toBe('aguardando_codigo');
    expect(r.pin).toBeUndefined(); // o PIN nunca sai pro cliente
  });

  test('meio-provisionado NÃO toca o registry de roteamento', async () => {
    graphOk([{ id: 'phone-123' }, { success: true }]);
    await iniciar({ restaurantId: RID, modo: 'numero_proprio', cc: '55', numero: '11999998888', metodo: 'voice' });
    expect(mockRegistryUpdate).not.toHaveBeenCalled();
  });

  test('validação barra cc/número ruins ANTES de qualquer chamada à Meta', async () => {
    global.fetch = jest.fn();
    await expect(iniciar({ restaurantId: RID, modo: 'numero_proprio', cc: 'abc', numero: '11999998888' }))
      .rejects.toThrow(/código do país/i);
    await expect(iniciar({ restaurantId: RID, modo: 'numero_proprio', cc: '55', numero: '123' }))
      .rejects.toThrow(/número inválido/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('sem envs da Meta, erro claro de plataforma — não um 500 misterioso', async () => {
    delete process.env.WHATSAPP_WABA_ID;
    await expect(iniciar({ restaurantId: RID, modo: 'numero_proprio', cc: '55', numero: '11999998888' }))
      .rejects.toThrow(/não está habilitado/i);
  });
});

describe('confirmarCodigo', () => {
  const aguardando = {
    estado: 'aguardando_codigo', modo: 'numero_proprio', cc: '55',
    numero_e164: '+5511999998888', metodo: 'SMS', phone_number_id: 'phone-123', pin: '424242',
  };

  test('verifica, registra com o PIN guardado e SÓ ENTÃO aponta o roteamento', async () => {
    mockConfigMaybeSingle.mockResolvedValue({ data: { id: RID, whatsapp_provisioning: aguardando }, error: null });
    graphOk([{ success: true }, { success: true }]);

    const r = await confirmarCodigo({ restaurantId: RID, codigo: '123456' });

    const g = chamadasGraph();
    expect(g[0]).toEqual({ caminho: '/phone-123/verify_code', corpo: { code: '123456' } });
    expect(g[1]).toEqual({ caminho: '/phone-123/register', corpo: { messaging_product: 'whatsapp', pin: '424242' } });
    expect(mockRegistryUpdate).toHaveBeenCalledWith({ whatsapp_phone_number_id: 'phone-123' });
    expect(r.estado).toBe('ativo');
    expect(r.pin).toBeUndefined();
  });

  test('código errado NÃO mata a jornada — continua aguardando_codigo pra nova tentativa', async () => {
    mockConfigMaybeSingle.mockResolvedValue({ data: { id: RID, whatsapp_provisioning: aguardando }, error: null });
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, json: async () => ({ error: { message: 'The verify code is incorrect' } }),
    });

    await expect(confirmarCodigo({ restaurantId: RID, codigo: '000000' })).rejects.toThrow(/não confere/i);
    // nenhum update pra estado 'erro' — o único update permitido seria o de sucesso
    const gravouErro = mockConfigUpdate.mock.calls.some(([p]) => p.whatsapp_provisioning?.estado === 'erro');
    expect(gravouErro).toBe(false);
    expect(mockRegistryUpdate).not.toHaveBeenCalled();
  });

  test('restaurante fora do registry central: erro pede suporte e cita a linha ausente no detalhe', async () => {
    mockConfigMaybeSingle.mockResolvedValue({ data: { id: RID, whatsapp_provisioning: aguardando }, error: null });
    graphOk([{ success: true }, { success: true }]);
    mockRegistryUpdate.mockResolvedValue({ data: [], error: null });

    await expect(confirmarCodigo({ restaurantId: RID, codigo: '123456' })).rejects.toThrow(/suporte/i);
  });

  test('sem verificação pendente, orienta a iniciar primeiro', async () => {
    mockConfigMaybeSingle.mockResolvedValue({ data: { id: RID, whatsapp_provisioning: null }, error: null });
    await expect(confirmarCodigo({ restaurantId: RID, codigo: '123456' })).rejects.toThrow(/inicie a conexão/i);
  });
});

describe('mock — fechado por env', () => {
  test('sem ALLOW_MOCK_WHATSAPP_PROVISIONING, mock é recusado', async () => {
    await expect(iniciar({ restaurantId: RID, modo: 'mock' })).rejects.toThrow(/não está habilitado/i);
  });

  test('com o env ligado, ativa na hora e aponta roteamento com id mock_', async () => {
    process.env.ALLOW_MOCK_WHATSAPP_PROVISIONING = 'true';
    const r = await iniciar({ restaurantId: RID, modo: 'mock' });
    expect(r.estado).toBe('ativo');
    expect(r.phone_number_id).toMatch(/^mock_/);
    expect(mockRegistryUpdate).toHaveBeenCalled();
  });
});

describe('estadoPublico', () => {
  test('sem jornada → nao_iniciado; com jornada → estado sem PIN', async () => {
    expect((await estadoPublico(RID)).estado).toBe('nao_iniciado');
    mockConfigMaybeSingle.mockResolvedValue({
      data: { id: RID, whatsapp_provisioning: { estado: 'aguardando_codigo', pin: '111111', numero_e164: '+55x' } },
      error: null,
    });
    const e = await estadoPublico(RID);
    expect(e.estado).toBe('aguardando_codigo');
    expect(e.pin).toBeUndefined();
  });

  test('coluna ausente (migração pendente) vira mensagem clara', async () => {
    mockConfigMaybeSingle.mockResolvedValue({ data: null, error: { code: '42703', message: 'column does not exist' } });
    await expect(estadoPublico(RID)).rejects.toThrow(/atualização de banco pendente/i);
  });
});

describe('mensagens de erro nunca vazam internals', () => {
  test('erro desconhecido da Meta vira orientação genérica; o técnico fica no detalhe', async () => {
    graphOk([]);
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, json: async () => ({ error: { message: 'Unsupported post request. Object with ID xyz' } }),
    });
    try {
      await iniciar({ restaurantId: RID, modo: 'numero_proprio', cc: '55', numero: '11999998888' });
      throw new Error('devia ter lançado');
    } catch (err) {
      expect(err).toBeInstanceOf(ErroDeProvisionamento);
      expect(err.message).not.toMatch(/Object with ID/);
      expect(err.detalhe).toMatch(/Object with ID/);
    }
  });
});
