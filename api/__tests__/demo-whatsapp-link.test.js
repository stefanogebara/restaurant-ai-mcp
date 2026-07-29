'use strict';

/**
 * Vínculo telefone → demo, para que a RESPOSTA do dono no WhatsApp seja
 * atendida pela IA do demo dele.
 *
 * O contrato principal aqui é uma RECUSA: nunca roubar a sessão de um número
 * que já pertence a um restaurante ativo. Se isso acontecesse, as mensagens dos
 * clientes daquele restaurante passariam a ser respondidas pelo demo — dano
 * silencioso e caro, no cliente que paga.
 *
 * Desenho verificado contra o banco:
 *  - whatsapp_sessions.restaurant_id tem FK para restaurant_registry → o demo
 *    precisa existir lá;
 *  - `is_active: false` mantém o demo fora de getAllActiveRestaurants(), logo
 *    fora do seletor e do auto-assign;
 *  - a FK é ON DELETE SET NULL → quando o cron apaga o demo expirado, a sessão
 *    volta ao roteamento normal sozinha.
 */

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
jest.mock('../_lib/secure-logger', () => ({ createSecureLogger: () => mockLogger }));

const mockUpsert = jest.fn();
const mockAtivos = jest.fn();
const mockGetOrCreate = jest.fn();
const mockGetByPhone = jest.fn();
const mockSetRestaurant = jest.fn();

jest.mock('../_lib/restaurant-registry', () => ({
  upsertRestaurant: (...a) => mockUpsert(...a),
  getAllActiveRestaurants: (...a) => mockAtivos(...a),
}));
jest.mock('../_lib/whatsapp-sessions', () => ({
  getOrCreateSession: (...a) => mockGetOrCreate(...a),
  getSessionByPhone: (...a) => mockGetByPhone(...a),
  setSessionRestaurant: (...a) => mockSetRestaurant(...a),
}));

const { vincularTelefoneAoDemo } = require('../_lib/demo-whatsapp-link');

const DEMO = { telefone: '5511999998888', demoId: 'demo-abc', nome: 'Mocotó', idioma: 'pt-BR' };
const REAL_ID = 'rest-real-999';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetByPhone.mockResolvedValue(null);
  mockAtivos.mockResolvedValue([]);
  mockUpsert.mockResolvedValue({ data: { id: DEMO.demoId }, error: null });
  mockGetOrCreate.mockResolvedValue({ id: 'sess-1' });
  mockSetRestaurant.mockResolvedValue({ id: 'sess-1', restaurant_id: DEMO.demoId });
});

describe('caminho normal', () => {
  test('vincula e devolve vinculado:true', async () => {
    const r = await vincularTelefoneAoDemo(DEMO);
    expect(r).toEqual({ vinculado: true });
    expect(mockSetRestaurant).toHaveBeenCalledWith('sess-1', DEMO.demoId);
  });

  test('registra o demo como INATIVO — fora do seletor e do auto-assign', async () => {
    // Se entrasse como ativo, um cliente real poderia cair no restaurante de
    // demo pelo roteamento automático.
    await vincularTelefoneAoDemo(DEMO);
    expect(mockUpsert).toHaveBeenCalledWith(DEMO.demoId, expect.objectContaining({ is_active: false }));
  });
});

describe('a recusa que protege o cliente que paga', () => {
  test('telefone já ligado a restaurante ATIVO não é sobrescrito', async () => {
    mockGetByPhone.mockResolvedValue({ id: 'sess-1', restaurant_id: REAL_ID });
    mockAtivos.mockResolvedValue([{ id: REAL_ID, restaurant_name: 'Cliente Real' }]);

    const r = await vincularTelefoneAoDemo(DEMO);

    expect(r).toEqual({ vinculado: false, motivo: 'telefone_de_cliente_ativo' });
    expect(mockSetRestaurant).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled(); // nem toca no registry
  });

  test('sessão ligada a restaurante INATIVO (demo antigo) pode ser revinculada', async () => {
    mockGetByPhone.mockResolvedValue({ id: 'sess-1', restaurant_id: 'demo-antigo' });
    mockAtivos.mockResolvedValue([{ id: REAL_ID }]); // o antigo não está entre os ativos

    const r = await vincularTelefoneAoDemo(DEMO);
    expect(r.vinculado).toBe(true);
  });

  test('se a checagem falhar, NÃO vincula — na dúvida, não sobrescreve', async () => {
    mockGetByPhone.mockRejectedValue(new Error('supabase fora'));

    const r = await vincularTelefoneAoDemo(DEMO);

    expect(r).toEqual({ vinculado: false, motivo: 'checagem_falhou' });
    expect(mockSetRestaurant).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  test('revincular ao MESMO demo é permitido — não é conflito', async () => {
    mockGetByPhone.mockResolvedValue({ id: 'sess-1', restaurant_id: DEMO.demoId });
    mockAtivos.mockResolvedValue([]);

    const r = await vincularTelefoneAoDemo(DEMO);
    expect(r.vinculado).toBe(true);
  });
});

describe('falhas deixam rastro e não fingem sucesso', () => {
  test('registry falhou → vinculado:false com log de erro', async () => {
    mockUpsert.mockResolvedValue({ data: null, error: 'permission denied' });

    const r = await vincularTelefoneAoDemo(DEMO);

    expect(r).toEqual({ vinculado: false, motivo: 'registry_falhou' });
    expect(mockLogger.error).toHaveBeenCalled();
  });

  test('sessão não criada → vinculado:false', async () => {
    mockGetOrCreate.mockResolvedValue(null);
    const r = await vincularTelefoneAoDemo(DEMO);
    expect(r).toEqual({ vinculado: false, motivo: 'sessao_falhou' });
    expect(mockLogger.error).toHaveBeenCalled();
  });

  test('setSessionRestaurant devolvendo null não conta como vinculado', async () => {
    // Silenciar isto faria a UI convidar o dono a responder sem que a sessão
    // aponte para o demo — ele responde e ninguém atende.
    mockSetRestaurant.mockResolvedValue(null);
    const r = await vincularTelefoneAoDemo(DEMO);
    expect(r).toEqual({ vinculado: false, motivo: 'vinculo_falhou' });
    expect(mockLogger.error).toHaveBeenCalled();
  });

  test('dados incompletos saem cedo, sem tocar em nada', async () => {
    expect(await vincularTelefoneAoDemo({ telefone: '', demoId: 'x' })).toEqual({ vinculado: false, motivo: 'dados_incompletos' });
    expect(await vincularTelefoneAoDemo({ telefone: '551199', demoId: null })).toEqual({ vinculado: false, motivo: 'dados_incompletos' });
    expect(mockGetByPhone).not.toHaveBeenCalled();
  });
});
