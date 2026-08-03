'use strict';

/**
 * Extrair o número que a PRÓPRIA casa publica no menu do robô.
 *
 * CASO REAL (Restaurante Zé Leite, 16/07/2026): a primeira resposta foi o menu
 * do autoatendimento, e dentro dele, na linha "2️⃣ Reservas 📲", o número
 * 1197321-0441. A Olímpia tratou o menu como ruído e passou OITO mensagens
 * perguntando "você que cuida das reservas aí?" — com a resposta na tela desde
 * o primeiro segundo. Duas semanas paradas no número errado.
 *
 * O menu não é ruído: é onde a casa publica para qual número vai cada assunto.
 *
 * O perigo aqui é falso positivo. Mandar o fundador falar com um CNPJ, um CEP
 * ou um horário de funcionamento é pior que não extrair nada — por isso a
 * fixture principal é a mensagem REAL, que traz o alvo junto de cinco faixas
 * de horário desenhadas para confundir.
 */

const { extrairNumeroIndicado } = require('../_lib/prospecting/numero-indicado');

/**
 * A fiação. Um extrator perfeito que ninguém chama é o defeito que este projeto
 * já teve com semHumanoNaThread — meses existindo sem chamador.
 */
describe('o inbound REGISTRA o número indicado (fiação)', () => {
  const MENU = '2️⃣ Reservas 📲\n1197321-0441\n\n3️⃣ Atendimento 11:00 às 22:30';

  function montar({ leadJaTem = null } = {}) {
    jest.resetModules();
    const patchLead = jest.fn(async () => ({ ok: true }));
    const recordEvent = jest.fn(async () => ({}));
    jest.doMock('../_lib/secure-logger', () => ({ createSecureLogger: () => ({ info(){}, warn(){}, error(){}, debug(){} }) }));
    jest.doMock('../_lib/rate-limit', () => ({ isMessageDuplicate: async () => false }));
    jest.doMock('../_lib/prospecting/prospect-responder', () => ({ respondToProspect: async () => ({}) }));
    jest.doMock('../_lib/prospecting/prospect-store', () => ({
      isOptedOut: async () => false,
      findLeadByPhone: async () => ({
        id: 'L1', name: 'Zé Leite', whatsapp_phone: '+5511997756868',
        prospect_state: 'conversando', numero_indicado: leadJaTem,
      }),
      storeMessage: async () => ({}),
      patchLead,
      recordEvent,
    }));
    const { handleProspectInbound } = require('../_lib/prospecting/prospect-inbound');
    const req = { body: { entry: [{ changes: [{ value: {
      messages: [{ from: '5511997756868', id: `wamid-${Math.random()}`, type: 'text', text: { body: MENU } }],
      contacts: [{ profile: { name: 'Zé Leite' } }],
    } }] }] } };
    return { handleProspectInbound, req, patchLead, recordEvent };
  }

  test('grava numero_indicado e registra o evento na linha do tempo', async () => {
    const { handleProspectInbound, req, patchLead, recordEvent } = montar();
    await handleProspectInbound({}, req);
    expect(patchLead).toHaveBeenCalledWith('L1', expect.objectContaining({
      numero_indicado: '+5511973210441',
    }));
    expect(recordEvent).toHaveBeenCalledWith('L1', expect.stringContaining('+5511973210441'));
  });

  test('não sobrescreve indicação anterior', async () => {
    // A primeira costuma ser a do menu oficial; regravar a cada mensagem faria
    // o cockpit piscar sem motivo.
    const { handleProspectInbound, req, patchLead } = montar({ leadJaTem: '+5511900000000' });
    await handleProspectInbound({}, req);
    expect(patchLead).toHaveBeenCalledWith('L1', expect.not.objectContaining({
      numero_indicado: expect.anything(),
    }));
  });

  test('o patch de last_in_at continua acontecendo', async () => {
    // O registro do número entra no MESMO patch que grava last_in_at. Se este
    // teste cair, a janela de 24h parou de ser atualizada.
    const { handleProspectInbound, req, patchLead } = montar();
    await handleProspectInbound({}, req);
    expect(patchLead).toHaveBeenCalledWith('L1', expect.objectContaining({
      last_in_at: expect.any(String),
    }));
  });
});

const MENU_ZE_LEITE = `Oxente,
Se avexe não, pode entrar! 🌵

1️⃣ Pedidos Delivery 🥘
Seg. a Sexta                          12:00 às 15:00 / 18:00 às 22h
Sábado de 12:00 às 17:00/ 18:00 às 22h
Domingo de 12:00h às 16:30h

Ifood: Casa do Norte Zé Leite - Oficial

2️⃣ Reservas 📲
1197321-0441

3️⃣ Horário de atendimento                          11:00 às 22:30

Vou chegando 🤩`;

describe('o caso que motivou o extrator', () => {
  test('acha o número de reservas no menu real do Zé Leite', () => {
    const r = extrairNumeroIndicado(MENU_ZE_LEITE, { numeroDoLead: '+5511997756868' });
    expect(r).toMatchObject({ numero: '+5511973210441' });
    expect(r.contexto.toLowerCase()).toContain('reserva');
  });

  test('NENHUM dos cinco horários do mesmo menu vira telefone', () => {
    // 12:00, 15:00, 18:00, 22h, 16:30, 11:00, 22:30 — se algum casasse, o
    // fundador receberia um número inventado com cara de verdade.
    const r = extrairNumeroIndicado(MENU_ZE_LEITE, { numeroDoLead: '+5511997756868' });
    expect(r.numero).toBe('+5511973210441');
  });
});

describe('formatos que aparecem de verdade', () => {
  const casos = [
    ['(11) 97321-0441', '+5511973210441'],
    ['11 97321-0441', '+5511973210441'],
    ['+55 11 97321-0441', '+5511973210441'],
    ['11973210441', '+5511973210441'],
    ['fixo: 11 3721-0441', '+551137210441'],
  ];
  test.each(casos)('reconhece %s', (escrito, esperado) => {
    const r = extrairNumeroIndicado(`Para reservas, chame no ${escrito}`, { numeroDoLead: '+5511999999999' });
    expect(r?.numero).toBe(esperado);
  });
});

describe('o que NÃO pode virar telefone', () => {
  test('CNPJ', () => {
    const txt = 'Pagamento via Pix com nosso CNPJ: 27.915.077/0001-48. Fale conosco.';
    expect(extrairNumeroIndicado(txt, { numeroDoLead: '+5511999999999' })).toBeNull();
  });

  test('CEP e endereço', () => {
    const txt = 'Estamos na Rua das Flores, 1234 — CEP 01310-100. Venha nos visitar!';
    expect(extrairNumeroIndicado(txt, { numeroDoLead: '+5511999999999' })).toBeNull();
  });

  test('valores em reais', () => {
    const txt = 'Contato: o rodízio sai por R$ 1.234,56 por pessoa';
    expect(extrairNumeroIndicado(txt, { numeroDoLead: '+5511999999999' })).toBeNull();
  });

  test('número SEM contexto de contato não conta', () => {
    // Sem palavra de roteamento por perto é chute. Preferimos perder o sinal a
    // mandar o fundador falar com um número aleatório do texto.
    expect(extrairNumeroIndicado('Somos 11 97321-0441 pessoas na equipe', { numeroDoLead: '+5511999999999' })).toBeNull();
  });

  test('o próprio número do lead não é "outro número"', () => {
    const txt = 'Para reservas fale no 11 99775-6868';
    expect(extrairNumeroIndicado(txt, { numeroDoLead: '+5511997756868' })).toBeNull();
  });

  test('DDD inválido', () => {
    expect(extrairNumeroIndicado('reservas no 01 97321-0441', { numeroDoLead: '+5511999999999' })).toBeNull();
  });

  test('contexto cortado no meio de um emoji ainda serializa em JSON', () => {
    // BUG REAL, achado no backfill (Sabor da Massa, 1 de 12): o contexto sai de
    // um slice por índice, que parte pares substitutos ao meio. String com
    // surrogate órfão não vira JSON — o PostgREST responde "Empty or invalid
    // json" e o patch INTEIRO falha. E esse patch é o que grava last_in_at:
    // sem isto, uma mensagem com emoji na posição errada impediria a
    // atualização da janela de 24h do lead.
    const emoji = '🍕';
    // Empurra o emoji para exatamente a borda dos 80 chars de janela.
    const texto = `${emoji}${'x'.repeat(79)} reservas no 11 97321-0441`;
    const r = extrairNumeroIndicado(texto, { numeroDoLead: '+5511999999999' });
    expect(r).not.toBeNull();
    expect(() => JSON.stringify(r)).not.toThrow();
    expect(r.contexto).not.toMatch(/[\uD800-\uDFFF]/);
  });

  test('entradas vazias não explodem', () => {
    expect(extrairNumeroIndicado(null, {})).toBeNull();
    expect(extrairNumeroIndicado('', {})).toBeNull();
    expect(extrairNumeroIndicado('   ', {})).toBeNull();
  });
});
