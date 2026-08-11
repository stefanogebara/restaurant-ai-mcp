'use strict';

/**
 * Follow-up da proposta por e-mail.
 *
 * O risco central deste recurso não é técnico, é social: a resposta da proposta
 * vai para o replyTo (a caixa do FUNDADOR), que o sistema não enxerga. Então o
 * sistema pode achar que houve silêncio quando a pessoa já respondeu. Estes
 * testes travam as três defesas contra isso: espera longa, qualquer inbound
 * cancela, e o texto assume que pode estar enganado.
 */

const {
  buildFollowupEmail, followupDevido, eventoDeFollowup, eventoDeEnvio,
  FOLLOWUP_MARKER, FOLLOWUP_ESPERA_MS,
} = require('../_lib/prospecting/founder-email');
const { lintOutbound } = require('../_lib/prospecting/claim-linter');

const AGORA = Date.parse('2026-08-11T15:00:00.000Z');
const DIA = 24 * 60 * 60 * 1000;

const LEAD = { id: 'l1', name: 'Bario Bar', owner_name: 'Leo', prospect_email: 'compras@bario.com.br' };
const OPTS = {
  founderName: 'Stefano',
  founderEmail: 'stefanogebara@gmail.com',
  founderPhone: '(11) 99900-2121',
  previaUrl: 'https://racha-gray.vercel.app/?t=demoracha',
};

function proposta(msAtras) {
  return {
    direcao: 'sys',
    corpo: eventoDeEnvio('compras@bario.com.br'),
    created_at: new Date(AGORA - msAtras).toISOString(),
  };
}

describe('followupDevido — quando cobrar silêncio', () => {
  test('silêncio depois da espera: devido', () => {
    const r = followupDevido({ historico: [proposta(5 * DIA)], nowMs: AGORA });
    expect(r.devido).toBe(true);
    expect(r.motivo).toBe('silencio_apos_proposta');
  });

  test('cedo demais não cobra', () => {
    expect(followupDevido({ historico: [proposta(1 * DIA)], nowMs: AGORA }).motivo).toBe('cedo_demais');
  });

  test('sem proposta enviada não existe follow-up', () => {
    expect(followupDevido({ historico: [], nowMs: AGORA }).motivo).toBe('proposta_nunca_enviada');
  });

  test('QUALQUER inbound depois da proposta cancela a cobrança', () => {
    // Não importa o que a pessoa disse: quem respondeu não leva cobrança.
    const historico = [
      proposta(6 * DIA),
      { direcao: 'in', corpo: 'vou ver com o socio', created_at: new Date(AGORA - 5 * DIA).toISOString() },
    ];
    expect(followupDevido({ historico, nowMs: AGORA }).motivo).toBe('lead_respondeu');
  });

  test('inbound ANTES da proposta não conta como resposta', () => {
    const historico = [
      { direcao: 'in', corpo: 'manda pro compras@', created_at: new Date(AGORA - 9 * DIA).toISOString() },
      proposta(6 * DIA),
    ];
    expect(followupDevido({ historico, nowMs: AGORA }).devido).toBe(true);
  });

  test('um follow-up é insistência, dois seriam perseguição', () => {
    const historico = [
      proposta(20 * DIA),
      {
        direcao: 'sys',
        corpo: eventoDeFollowup('compras@bario.com.br'),
        created_at: new Date(AGORA - 15 * DIA).toISOString(),
      },
    ];
    expect(followupDevido({ historico, nowMs: AGORA }).motivo).toBe('followup_ja_enviado');
  });

  test('a espera é configurável', () => {
    const historico = [proposta(2 * DIA)];
    expect(followupDevido({ historico, nowMs: AGORA, esperaMs: 1 * DIA }).devido).toBe(true);
    expect(followupDevido({ historico, nowMs: AGORA, esperaMs: 10 * DIA }).devido).toBe(false);
  });

  test('a espera padrão dá tempo do fundador ver a resposta na caixa dele', () => {
    // A resposta vai pro replyTo (Gmail do fundador), invisível ao sistema. A
    // espera longa é o único amortecedor contra cobrar quem já falou.
    expect(FOLLOWUP_ESPERA_MS).toBeGreaterThanOrEqual(3 * DIA);
  });
});

describe('buildFollowupEmail', () => {
  test('assume que pode estar enganado sobre o silêncio', () => {
    const { text } = buildFollowupEmail(LEAD, OPTS);
    expect(text).toMatch(/já respondeu/i);
  });

  test('oferece saída explícita', () => {
    expect(buildFollowupEmail(LEAD, OPTS).text).toMatch(/não escrevo de novo/i);
  });

  test('diz que é reenvio único, não uma série', () => {
    expect(buildFollowupEmail(LEAD, OPTS).text).toMatch(/uma vez só/i);
  });

  test('assunto marca retomada e nomeia a casa', () => {
    expect(buildFollowupEmail(LEAD, OPTS).subject).toBe('Racha — retomando o contato sobre Bario Bar');
  });

  test('sem nome da casa o assunto não vira "sobre undefined"', () => {
    expect(buildFollowupEmail({ id: 'x' }, OPTS).subject).toBe('Racha — retomando o contato');
  });

  test('passa limpo no claim-linter', () => {
    expect(lintOutbound(buildFollowupEmail(LEAD, OPTS).text).violations).toEqual([]);
  });

  test('é mais curto que a proposta (é lembrete, não repitch)', () => {
    const { buildProposalEmail } = require('../_lib/prospecting/founder-email');
    const followup = buildFollowupEmail(LEAD, OPTS).text.length;
    const proposal = buildProposalEmail(LEAD, OPTS).text.length;
    expect(followup).toBeLessThan(proposal / 2);
  });

  test('leva o link do demo e escapa HTML hostil', () => {
    const { html } = buildFollowupEmail({ ...LEAD, name: '<script>x</script>' }, OPTS);
    expect(html).toContain('racha-gray.vercel.app');
    expect(html).not.toContain('<script>');
  });

  test('assinatura colada, sem parágrafos soltos', () => {
    const { text } = buildFollowupEmail(LEAD, OPTS);
    expect(text).toMatch(/Stefano Gebara\nFundador · Racha\n/);
    expect(text).not.toMatch(/\n{3,}/);
  });

  test('marcador do evento começa com o prefixo da busca', () => {
    expect(eventoDeFollowup('x@y.com').startsWith(FOLLOWUP_MARKER)).toBe(true);
    expect(eventoDeFollowup('x@y.com')).toContain('x@y.com');
  });
});
