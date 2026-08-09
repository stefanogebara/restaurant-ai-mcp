/**
 * Proposta do fundador por e-mail — compositor puro.
 *
 * O envio é autônomo (decisão do fundador, 08/08/2026), então o conteúdo é
 * determinístico de propósito: revisado uma vez, válido sempre. Estes testes
 * pinam o contrato que torna isso seguro, incluindo o auto-lint que impede uma
 * edição futura de reintroduzir claim proibido.
 */

const {
  buildProposalEmail, propostaJaEnviada, eventoDeEnvio, PROPOSAL_MARKER,
} = require('../_lib/prospecting/founder-email');
const { lintOutbound } = require('../_lib/prospecting/claim-linter');

const LEAD = { id: 'l1', name: 'Bario Bar', owner_name: 'Leo', prospect_email: 'compras@bario.com.br' };
const OPTS = {
  founderName: 'Stefano',
  founderEmail: 'stefanogebara@gmail.com',
  founderPhone: '(11) 99900-2121',
  previaUrl: 'https://racha-gray.vercel.app/?t=demoracha',
};

describe('buildProposalEmail — conteúdo', () => {
  test('assunto nomeia a casa', () => {
    expect(buildProposalEmail(LEAD, OPTS).subject).toBe(
      'Racha — pagamento na mesa por QR para Bario Bar'
    );
  });

  test('sem nome da casa, assunto genérico em vez de "para undefined"', () => {
    expect(buildProposalEmail({ id: 'x' }, OPTS).subject).toBe('Racha — pagamento na mesa por QR');
  });

  test('cita quem passou o contato quando se sabe', () => {
    const { text } = buildProposalEmail(LEAD, OPTS);
    expect(text).toMatch(/O Leo, aí do Bario Bar, indicou este e-mail/);
  });

  test('sem indicação, abre neutro em vez de inventar um nome', () => {
    const { text } = buildProposalEmail({ id: 'x', name: 'Casa X' }, OPTS);
    expect(text).toMatch(/Fui orientado a escrever para este endereço/);
    expect(text).not.toMatch(/indicou este e-mail/);
  });

  test('nome com sobrenome vira só o primeiro nome', () => {
    const { text } = buildProposalEmail({ ...LEAD, owner_name: 'Leonardo Silva Santos' }, OPTS);
    expect(text).toMatch(/O Leonardo, aí do Bario Bar/);
  });

  test('owner_name lixo não vaza pro corpo', () => {
    // A base tem owner_name com telefone, "-", "(11)" e afins.
    for (const lixo of ['(11)', '-', '99999', '  ']) {
      const { text } = buildProposalEmail({ ...LEAD, owner_name: lixo }, OPTS);
      expect(text).toMatch(/Fui orientado a escrever/);
      expect(text).not.toMatch(/indicou este e-mail/);
    }
  });

  test('leva o link do demo e a assinatura com contato do fundador', () => {
    const { text, html } = buildProposalEmail(LEAD, OPTS);
    expect(text).toContain('https://racha-gray.vercel.app/?t=demoracha');
    expect(text).toContain('(11) 99900-2121');
    expect(html).toContain('<a href="https://racha-gray.vercel.app/?t=demoracha"');
  });

  test('não anexa deck nem promete anexo', () => {
    // Link converte mais e chega mais que 760KB de PDF em cold email.
    const { text } = buildProposalEmail(LEAD, OPTS);
    expect(text).not.toMatch(/anexo|em anexo|segue a apresenta/i);
  });
});

describe('buildProposalEmail — segurança do envio autônomo', () => {
  test('o corpo passa limpo no claim-linter', () => {
    const { text } = buildProposalEmail(LEAD, OPTS);
    expect(lintOutbound(text).violations).toEqual([]);
  });

  test('explica a gorjeta pelo enquadramento legal correto', () => {
    const { text } = buildProposalEmail(LEAD, OPTS);
    expect(text).toMatch(/CNPJ do restaurante/);
    expect(text).toMatch(/pela folha/);
    expect(text).toMatch(/13\.419/);
    expect(text).toMatch(/não paga nada a mais/);
  });

  test('determinístico: mesma entrada, mesmo e-mail', () => {
    const a = buildProposalEmail(LEAD, OPTS);
    const b = buildProposalEmail(LEAD, OPTS);
    expect(a).toEqual(b);
  });

  test('HTML escapa nome de casa hostil', () => {
    const { html, subject } = buildProposalEmail(
      { ...LEAD, name: 'Bar <script>alert(1)</script>' }, OPTS
    );
    expect(html).not.toContain('<script>');
    // O assunto é texto puro no cabeçalho, o corpo é o que precisa escapar.
    expect(subject).toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('idempotência do envio', () => {
  test('propostaJaEnviada acha o marcador no histórico', () => {
    const msgs = [
      { direcao: 'out', corpo: 'oi!' },
      { direcao: 'sys', corpo: eventoDeEnvio('compras@bario.com.br') },
    ];
    expect(propostaJaEnviada(msgs)).toBe(true);
  });

  test('histórico sem o marcador não bloqueia o envio', () => {
    expect(propostaJaEnviada([{ direcao: 'in', corpo: 'me manda por e-mail' }])).toBe(false);
    expect(propostaJaEnviada([])).toBe(false);
    expect(propostaJaEnviada(null)).toBe(false);
  });

  test('o evento começa com o marcador (é o que a busca usa)', () => {
    expect(eventoDeEnvio('x@y.com').startsWith(PROPOSAL_MARKER)).toBe(true);
    expect(eventoDeEnvio('x@y.com')).toContain('x@y.com');
  });
});

describe('formatação do text/plain', () => {
  test('assinatura sai em linhas coladas, não em parágrafos soltos', () => {
    const { text } = buildProposalEmail(LEAD, OPTS);
    expect(text).toMatch(/Stefano Gebara\nFundador · Racha\n/);
    // Nenhuma linha em branco tripla em lugar nenhum.
    expect(text).not.toMatch(/\n{3,}/);
  });

  test('o corpo continua separado por parágrafos', () => {
    const { text } = buildProposalEmail(LEAD, OPTS);
    expect(text).toMatch(/Olá, bom dia\.\n\n/);
  });
});
