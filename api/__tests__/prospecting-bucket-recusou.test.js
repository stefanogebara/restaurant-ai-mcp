'use strict';

/**
 * Quem recusou não pode contar como "Respondeu".
 *
 * ACHADO (auditoria do cockpit, 01/08/2026): `recusou` é estado de primeira
 * classe do funil (prospect-state.js) mas não tinha bucket em statusBucket().
 * Caía no switch de whatsapp_send_status e, como o responder marca
 * `whatsapp_send_status='replied'` em qualquer inbound, virava bucket
 * 'replied' — que o front pinta de verde "Respondeu" e mantém na fila de
 * Triagem indefinidamente (não está em TERMINAL_BUCKETS).
 *
 * Dois estragos ao mesmo tempo: o funil conta um "não" como positivo, e a fila
 * de trabalho do fundador entope com conversas encerradas. É o mesmo tipo de
 * denominador contaminado que o bucket 'porteiro' foi criado para revelar.
 */

const { statusBucket, bucketCounts, BUCKETS } = require('../_lib/prospecting/prospect-admin-view');

describe('statusBucket — recusou é terminal, não "respondeu"', () => {
  test('lead que recusou não vira replied', () => {
    // whatsapp_send_status='replied' é o que o responder grava em QUALQUER
    // inbound — inclusive no inbound que disse "não temos interesse".
    expect(statusBucket({ prospect_state: 'recusou', whatsapp_send_status: 'replied' })).toBe('refused');
  });

  test('vale mesmo quando o envio ficou em outro estágio', () => {
    for (const envio of ['read', 'delivered', 'sent', 'failed', null, undefined]) {
      expect(statusBucket({ prospect_state: 'recusou', whatsapp_send_status: envio })).toBe('refused');
    }
  });

  test("'ganho' continua ganhando de tudo (precedência preservada)", () => {
    expect(statusBucket({ prospect_state: 'ganho', whatsapp_send_status: 'replied' })).toBe('won');
  });

  test('quem de fato respondeu e segue em conversa continua replied', () => {
    expect(statusBucket({ prospect_state: 'conversando', whatsapp_send_status: 'replied' })).toBe('replied');
  });

  test('optout e porteiro não foram afetados', () => {
    expect(statusBucket({ prospect_state: 'optout', whatsapp_send_status: 'replied' })).toBe('optout');
    expect(statusBucket({ prospect_state: 'porteiro', whatsapp_send_status: 'replied' })).toBe('porteiro');
  });
});

describe('bucketCounts — o funil precisa enxergar o bucket novo', () => {
  test("'refused' está na lista de buckets contados", () => {
    // Sem isto o contador nasce ausente e some do cabeçalho do cockpit — o
    // lead sairia do denominador em vez de aparecer como recusa.
    expect(BUCKETS).toContain('refused');
  });

  test('conta recusas separadamente das respostas', () => {
    const c = bucketCounts([
      { prospect_state: 'recusou', whatsapp_send_status: 'replied' },
      { prospect_state: 'recusou', whatsapp_send_status: 'read' },
      { prospect_state: 'conversando', whatsapp_send_status: 'replied' },
    ]);
    expect(c.refused).toBe(2);
    expect(c.replied).toBe(1);
  });
});
