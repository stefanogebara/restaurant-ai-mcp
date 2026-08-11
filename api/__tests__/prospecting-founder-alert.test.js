'use strict';

/**
 * Aviso ao fundador quando um lead calado responde.
 *
 * Lead em 'handoff' é SILENT_STATE: a Olímpia cala, o inbound é gravado, e até
 * agora ninguém era avisado. A resposta morria no banco esperando o fundador
 * abrir o lead por acaso. Espelho do caso Bario, do outro lado do fio.
 *
 * O eco de máquina usado aqui é a resposta REAL do Empório Esquina da Fruta,
 * que está no CRM: é exatamente o tipo de mensagem que, se virasse alerta,
 * treinaria o fundador a ignorar alerta.
 */

const {
  deveAvisarFundador, buildFounderAlert, eventoDeAviso, pareceEcoDeMaquina,
  ALERT_MARKER, COOLDOWN_MS,
} = require('../_lib/prospecting/founder-alert');

const NOW = Date.parse('2026-08-10T15:00:00.000Z');
const HORA = 60 * 60 * 1000;

const LEAD = {
  id: 'l1',
  name: 'Bario Bar - Tatuapé',
  city: 'São Paulo, SP',
  prospect_state: 'handoff',
  whatsapp_phone: '+5511915167135',
};

// Resposta automática real, colhida do CRM (lead Empório Esquina da Fruta).
const ECO_REAL =
  'Olá, tudo bem? Nós da Empório Esquina da Fruta agradecemos seu contato. ' +
  'Nossos horários de atendimento são: Quarta a Sexta 16hs às 23hs. Sábado e Domingo das 11hs às 22h30.';

describe('quando acordar o fundador', () => {
  test('resposta de gente em handoff alerta', () => {
    const r = deveAvisarFundador({ lead: LEAD, texto: 'Bom dia, me explica melhor?', nowMs: NOW });
    expect(r.alertar).toBe(true);
    expect(r.motivo).toBe('resposta_de_humano');
  });

  test('lead em conversando NÃO alerta (a Olímpia ainda está no volante)', () => {
    const r = deveAvisarFundador({
      lead: { ...LEAD, prospect_state: 'conversando' }, texto: 'oi', nowMs: NOW,
    });
    expect(r.alertar).toBe(false);
    expect(r.motivo).toBe('estado_nao_e_do_fundador');
  });

  test('agendando e agendado também são do fundador', () => {
    for (const estado of ['agendando', 'agendado']) {
      const r = deveAvisarFundador({ lead: { ...LEAD, prospect_state: estado }, texto: 'oi', nowMs: NOW });
      expect(r.alertar).toBe(true);
    }
  });

  test('texto vazio não alerta', () => {
    expect(deveAvisarFundador({ lead: LEAD, texto: '   ', nowMs: NOW }).motivo).toBe('sem_texto');
  });
});

describe('eco de máquina não vira alerta', () => {
  test('a resposta automática real do CRM é reconhecida', () => {
    expect(pareceEcoDeMaquina(ECO_REAL)).toBe(true);
    const r = deveAvisarFundador({ lead: LEAD, texto: ECO_REAL, nowMs: NOW });
    expect(r.alertar).toBe(false);
    expect(r.motivo).toBe('eco_de_maquina');
  });

  test.each([
    'Esta é uma mensagem automática, não responda a esta mensagem.',
    'Agradecemos seu contato! Retornaremos o contato em breve.',
    'Nossos horários de funcionamento são de segunda a sexta.',
  ])('outros ecos: %s', (texto) => {
    expect(deveAvisarFundador({ lead: LEAD, texto, nowMs: NOW }).alertar).toBe(false);
  });

  test('mensagem de gente que MENCIONA horário continua alertando', () => {
    // "que horário vocês instalam?" não é eco de máquina.
    const r = deveAvisarFundador({
      lead: LEAD, texto: 'Legal! Que horário vocês conseguem instalar aqui?', nowMs: NOW,
    });
    expect(r.alertar).toBe(true);
  });
});

describe('cooldown: uma rajada de mensagens vira um aviso só', () => {
  const historicoComAviso = (msAtras) => ([
    { direcao: 'sys', corpo: eventoDeAviso(['whatsapp']), created_at: new Date(NOW - msAtras).toISOString() },
  ]);

  test('segundo inbound logo depois não realerta', () => {
    const r = deveAvisarFundador({
      lead: LEAD, texto: 'e como funciona?', historico: historicoComAviso(10 * 60 * 1000), nowMs: NOW,
    });
    expect(r.alertar).toBe(false);
    expect(r.motivo).toBe('cooldown');
  });

  test('passada a janela, volta a alertar', () => {
    const r = deveAvisarFundador({
      lead: LEAD, texto: 'oi, ainda de pé?', historico: historicoComAviso(COOLDOWN_MS + HORA), nowMs: NOW,
    });
    expect(r.alertar).toBe(true);
  });

  test('histórico sem aviso nenhum não bloqueia', () => {
    const historico = [{ direcao: 'in', corpo: 'oi', created_at: new Date(NOW - HORA).toISOString() }];
    expect(deveAvisarFundador({ lead: LEAD, texto: 'oi', historico, nowMs: NOW }).alertar).toBe(true);
  });

  test('usa o aviso MAIS RECENTE quando há vários', () => {
    const historico = [
      { direcao: 'sys', corpo: eventoDeAviso(['whatsapp']), created_at: new Date(NOW - 5 * 24 * HORA).toISOString() },
      { direcao: 'sys', corpo: eventoDeAviso(['email']), created_at: new Date(NOW - 5 * 60 * 1000).toISOString() },
    ];
    expect(deveAvisarFundador({ lead: LEAD, texto: 'oi', historico, nowMs: NOW }).motivo).toBe('cooldown');
  });
});

describe('conteúdo do aviso', () => {
  test('leva o texto do lead, senão o fundador tem que abrir o sistema', () => {
    const a = buildFounderAlert({ lead: LEAD, texto: 'Podemos testar em duas mesas sim', nowMs: NOW });
    expect(a.whatsapp).toContain('Podemos testar em duas mesas sim');
    expect(a.text).toContain('Podemos testar em duas mesas sim');
    expect(a.html).toContain('Podemos testar em duas mesas sim');
    expect(a.subject).toContain('Bario Bar');
  });

  test('texto longo é cortado sem quebrar palavra', () => {
    const longo = 'palavra '.repeat(80);
    const a = buildFounderAlert({ lead: LEAD, texto: longo, nowMs: NOW });
    expect(a.whatsapp).toContain('…');
    expect(a.whatsapp).not.toMatch(/palav…/);
  });

  test('leva link wa.me pra responder em um toque', () => {
    const a = buildFounderAlert({ lead: LEAD, texto: 'oi', nowMs: NOW });
    expect(a.html).toContain('https://wa.me/5511915167135');
  });

  test('lead sem telefone não quebra o aviso', () => {
    const a = buildFounderAlert({ lead: { ...LEAD, whatsapp_phone: null }, texto: 'oi', nowMs: NOW });
    expect(a.whatsapp).toContain('oi');
    expect(a.html).not.toContain('wa.me');
  });

  test('HTML escapa texto hostil do lead', () => {
    const a = buildFounderAlert({ lead: LEAD, texto: '<script>alert(1)</script>', nowMs: NOW });
    expect(a.html).not.toContain('<script>');
    expect(a.html).toContain('&lt;script&gt;');
  });
});

describe('marcador do evento', () => {
  test('começa com o prefixo que o cooldown procura', () => {
    expect(eventoDeAviso(['whatsapp', 'email']).startsWith(ALERT_MARKER)).toBe(true);
    expect(eventoDeAviso(['whatsapp', 'email'])).toContain('whatsapp + email');
  });

  test('nenhum canal entregue ainda gera evento legível', () => {
    expect(eventoDeAviso([])).toContain('nenhum canal');
  });
});
