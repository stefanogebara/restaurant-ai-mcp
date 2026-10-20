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
const mockRegistryOwn = jest.fn();
const mockRegistryByNumber = jest.fn();
jest.mock('../_lib/central-supabase', () => ({
  isCentralConfigured: () => true,
  centralSupabase: {
    from: () => ({
      select: () => ({ eq: (column) => ({ maybeSingle: column === 'id' ? mockRegistryOwn : mockRegistryByNumber }) }),
      update: (payload) => ({
        eq: () => ({ eq: () => ({ is: () => ({ select: () => mockRegistryUpdate(payload) }) }) }),
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
  delete process.env.WHATSAPP_UNVERIFIED_ADD_NUMBER_DEV;
  mockConfigMaybeSingle.mockResolvedValue({ data: { id: RID, whatsapp_provisioning: null }, error: null });
  mockConfigUpdate.mockResolvedValue({ error: null });
  mockRegistryOwn.mockResolvedValue({ data: { id: RID, is_active: true, whatsapp_phone_number_id: null }, error: null });
  mockRegistryByNumber.mockResolvedValue({ data: null, error: null });
  mockRegistryUpdate.mockResolvedValue({ data: [{ id: RID }], error: null });
});

describe('iniciar (numero_proprio)', () => {
  beforeEach(() => { process.env.WHATSAPP_UNVERIFIED_ADD_NUMBER_DEV = 'true'; });
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
    expect(r.roteamento_confirmado).toBe(true);
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

  test('restaurante fora do registry central: recusa antes de chamar a Meta', async () => {
    mockConfigMaybeSingle.mockResolvedValue({ data: { id: RID, whatsapp_provisioning: aguardando }, error: null });
    mockRegistryOwn.mockResolvedValue({ data: null, error: null });
    global.fetch = jest.fn();

    await expect(confirmarCodigo({ restaurantId: RID, codigo: '123456' })).rejects.toThrow(/suporte/i);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockConfigUpdate.mock.calls.some(([payload]) => payload.whatsapp_provisioning?.estado === 'ativo')).toBe(false);
  });

  test('número de outro restaurante: não registra na Meta nem altera roteamento', async () => {
    mockConfigMaybeSingle.mockResolvedValue({ data: { id: RID, whatsapp_provisioning: aguardando }, error: null });
    mockRegistryByNumber.mockResolvedValue({ data: { id: 'outro-restaurante' }, error: null });
    global.fetch = jest.fn();
    await expect(confirmarCodigo({ restaurantId: RID, codigo: '123456' })).rejects.toThrow(/outro restaurante/i);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockRegistryUpdate).not.toHaveBeenCalled();
  });

  test('restaurante com outro número: exige suporte antes de trocar', async () => {
    mockConfigMaybeSingle.mockResolvedValue({ data: { id: RID, whatsapp_provisioning: aguardando }, error: null });
    mockRegistryOwn.mockResolvedValue({ data: { id: RID, is_active: true, whatsapp_phone_number_id: 'phone-antigo' }, error: null });
    global.fetch = jest.fn();
    await expect(confirmarCodigo({ restaurantId: RID, codigo: '123456' })).rejects.toThrow(/já usa outro número/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('mudança concorrente durante o registro não confirma um roteamento falso', async () => {
    mockConfigMaybeSingle.mockResolvedValue({ data: { id: RID, whatsapp_provisioning: aguardando }, error: null });
    graphOk([{ success: true }, { success: true }]);
    mockRegistryUpdate.mockResolvedValue({ data: [], error: null });
    await expect(confirmarCodigo({ restaurantId: RID, codigo: '123456' })).rejects.toThrow(/mudou durante/i);
    expect(mockConfigUpdate.mock.calls.some(([payload]) => payload.whatsapp_provisioning?.estado === 'ativo')).toBe(false);
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
    expect(await estadoPublico(RID)).toEqual({ estado: 'nao_iniciado', pode_iniciar: false, roteamento_confirmado: false });
    mockConfigMaybeSingle.mockResolvedValue({
      data: { id: RID, whatsapp_provisioning: { estado: 'aguardando_codigo', pin: '111111', numero_e164: '+55x' } },
      error: null,
    });
    const e = await estadoPublico(RID);
    expect(e.estado).toBe('aguardando_codigo');
    expect(e.pin).toBeUndefined();
    expect(e.pode_iniciar).toBe(false);
    expect(e.roteamento_confirmado).toBe(false);
  });

  test('ativo só é confirmado quando o registro central aponta para este mesmo número', async () => {
    mockConfigMaybeSingle.mockResolvedValue({ data: { id: RID, whatsapp_provisioning: {
      estado: 'ativo', numero_e164: '+5511999998888', phone_number_id: 'phone-123', pin: '123456', erro_detalhe: 'segredo',
    } }, error: null });
    const semVinculo = await estadoPublico(RID);
    expect(semVinculo.roteamento_confirmado).toBe(false);
    expect(semVinculo).not.toHaveProperty('pin');
    expect(semVinculo).not.toHaveProperty('erro_detalhe');
    mockRegistryOwn.mockResolvedValue({ data: { id: RID, is_active: true, whatsapp_phone_number_id: 'phone-123' }, error: null });
    expect((await estadoPublico(RID)).roteamento_confirmado).toBe(true);
    mockRegistryOwn.mockResolvedValue({ data: { id: RID, is_active: false, whatsapp_phone_number_id: 'phone-123' }, error: null });
    expect((await estadoPublico(RID)).roteamento_confirmado).toBe(false);
  });

  test('legado com receiver dedicado mostra somente o número confirmado pela WABA da Seatable', async () => {
    process.env.WHATSAPP_WABA_ID = '987654321098765';
    mockRegistryOwn.mockResolvedValue({ data: { id: RID, is_active: true, whatsapp_phone_number_id: '123456789012345' }, error: null });
    mockRegistryByNumber.mockResolvedValue({ data: { id: RID }, error: null });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [
        { id: '999999999999999', display_phone_number: '+55 11 2222-3333' },
        { id: '123456789012345', display_phone_number: '+55 11 99999-8888' },
      ] }),
    });

    const state = await estadoPublico(RID);
    expect(state).toMatchObject({
      estado: 'ativo', numero_e164: '+5511999998888',
      roteamento_confirmado: true, origem: 'registro_central',
    });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/v21.0/987654321098765/phone_numbers' }),
      expect.objectContaining({ headers: { Authorization: 'Bearer token-teste' } }),
    );
    expect(state).not.toHaveProperty('phone_number_id');
  });

  test('legado não publica wa.me quando Meta falha ou não devolve o receiver exato', async () => {
    process.env.WHATSAPP_WABA_ID = '987654321098765';
    mockRegistryOwn.mockResolvedValue({ data: { id: RID, is_active: true, whatsapp_phone_number_id: '123456789012345' }, error: null });
    mockRegistryByNumber.mockResolvedValue({ data: { id: RID }, error: null });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'other', display_phone_number: '+55 11 99999-8888' }] }),
    });
    const state = await estadoPublico(RID);
    expect(state.roteamento_confirmado).toBe(true);
    expect(state.numero_e164).toBeUndefined();
    global.fetch.mockRejectedValue(new Error('Meta unavailable'));
    expect((await estadoPublico(RID)).numero_e164).toBeUndefined();
  });

  test('legado inativo não é anunciado como conectado e receiver de outro tenant falha fechado', async () => {
    mockRegistryOwn.mockResolvedValue({ data: { id: RID, is_active: false, whatsapp_phone_number_id: '123456789012345' }, error: null });
    mockRegistryByNumber.mockResolvedValue({ data: { id: RID }, error: null });
    global.fetch = jest.fn();
    expect(await estadoPublico(RID)).toMatchObject({ estado: 'ativo', roteamento_confirmado: false });
    expect(global.fetch).not.toHaveBeenCalled();
    mockRegistryByNumber.mockResolvedValue({ data: { id: 'outro-restaurante' }, error: null });
    await expect(estadoPublico(RID)).rejects.toThrow(/outro restaurante/i);
  });

  test('produção nunca permite adicionar número novo, mesmo com a flag local ligada', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    process.env.WHATSAPP_UNVERIFIED_ADD_NUMBER_DEV = 'true';
    global.fetch = jest.fn();
    try {
      expect((await estadoPublico(RID)).pode_iniciar).toBe(false);
      await expect(iniciar({ restaurantId: RID, modo: 'numero_proprio', cc: '55', numero: '11999998888' }))
        .rejects.toThrow(/conexão automática ainda não está disponível/i);
      expect(global.fetch).not.toHaveBeenCalled();
      expect(mockConfigUpdate).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  test('coluna ausente (migração pendente) vira mensagem clara', async () => {
    mockConfigMaybeSingle.mockResolvedValue({ data: null, error: { code: '42703', message: 'column does not exist' } });
    await expect(estadoPublico(RID)).rejects.toThrow(/atualização de banco pendente/i);
  });
});

describe('mensagens de erro nunca vazam internals', () => {
  test('erro desconhecido da Meta vira orientação genérica; o técnico fica no detalhe', async () => {
    process.env.WHATSAPP_UNVERIFIED_ADD_NUMBER_DEV = 'true';
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
