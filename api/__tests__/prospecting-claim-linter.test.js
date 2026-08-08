/**
 * Claim linter — o portão de saída do envio autônomo.
 *
 * O fundador optou por autonomia TOTAL (08/08/2026). Estes testes são a razão de
 * isso não ser imprudente: as strings dos três incidentes reais de 07-08/08 são
 * casos de teste, e a copy corrigida que roda hoje tem que PASSAR limpa. Um
 * linter que não pega o que já vazou não serve; um que barra a nossa copy boa
 * serve menos ainda.
 */

const { lintOutbound, assertOutbound, FAMILIES } = require('../_lib/prospecting/claim-linter');
const { getProfile } = require('../_lib/prospecting/prospect-product');

// ------------------------------------------------- as strings que vazaram
const INCIDENTES = {
  founderCloseAntigo:
    'Oi! Aqui é o Stefano, fundador do Racha, o "pagar a conta na mesa por QR" que a ' +
    'Olímpia te apresentou. Queria te convidar pra ser uma das primeiras casas a testar, ' +
    'sem custo e sem compromisso: seus clientes pagam a conta pelo celular, cada um a sua ' +
    'parte, com a gorjeta indo direto pro garçom. Te mando uma prévia pra você ver do seu ' +
    'celular em 1 minuto, pode ser?',
  bulletAntigo:
    '- Gorjeta que chega no garçom: cai direto pra equipe, transparente, sem passar pelo caixa.',
  promessaDeEmail:
    'Tranquilo, Leo! Entendo que você segue as diretrizes da casa. Vou mandar a proposta ' +
    'pro compras@bario.com.br então.',
  aberturaAntiga:
    'a mesa vira mais rápido no rush e o garçom ainda recebe mais gorjeta. Posso te mostrar?',
};

describe('os três incidentes de 07-08/08 são bloqueados', () => {
  test('founderClose antigo: gorjeta indo direto pro garçom', () => {
    const r = lintOutbound(INCIDENTES.founderCloseAntigo);
    expect(r.ok).toBe(false);
    expect(r.violations.map((v) => v.id)).toContain('gorjeta-direta');
  });

  test('bullet de venda antigo: cai direto pra equipe, sem passar pelo caixa', () => {
    const r = lintOutbound(INCIDENTES.bulletAntigo);
    expect(r.ok).toBe(false);
    expect(r.violations.map((v) => v.id)).toContain('gorjeta-direta');
  });

  test('promessa de e-mail que a agente não pode cumprir', () => {
    const r = lintOutbound(INCIDENTES.promessaDeEmail);
    expect(r.ok).toBe(false);
    expect(r.violations.map((v) => v.id)).toContain('promessa-de-envio');
  });

  test('abertura antiga: o garçom ainda recebe mais gorjeta', () => {
    const r = lintOutbound(INCIDENTES.aberturaAntiga);
    expect(r.ok).toBe(false);
    expect(r.violations.map((v) => v.id)).toContain('gorjeta-direta');
  });
});

// ------------------------------------------------- a copy que roda hoje
describe('a copy corrigida em produção passa limpa', () => {
  test('founderClose atual do Racha', () => {
    const msg = getProfile().founderClose({ founderName: 'Stefano', ownerName: 'Ana' });
    const r = lintOutbound(msg);
    expect(r.violations).toEqual([]);
    expect(r.ok).toBe(true);
  });

  test('parágrafo de gorjeta do e-mail de proposta (o enquadramento correto)', () => {
    const trecho =
      'Os 10% de serviço entram na conta (o cliente pode remover, como manda o CDC) e ' +
      'liquidam no CNPJ do restaurante junto com o resto. A distribuição continua sendo ' +
      'de vocês, pela folha, como já é feita hoje. Não há repasse direto a funcionário, ' +
      'justamente para não criar exposição trabalhista (Lei 13.419/2017).';
    expect(lintOutbound(trecho).ok).toBe(true);
  });

  test('o piloto sem número de adoção prometido', () => {
    const trecho =
      'A proposta é um piloto sem custo e sem contrato, começando por algumas mesas, ' +
      'com métrica combinada antes de ligar. Não prometemos taxa de adoção: o piloto ' +
      'existe pra descobrir esse número na sua casa.';
    expect(lintOutbound(trecho).ok).toBe(true);
  });
});

// ------------------------------------------------- negação é falso positivo conhecido
describe('mensagem que NEGA o claim também casa (limitação assumida)', () => {
  const correcao =
    'Voltei só pra corrigir uma coisa que te falei e saiu errada: a gorjeta não vai ' +
    'direto pro bolso do garçom, ela cai no CNPJ do restaurante.';

  test('a correção dispara gorjeta-direta mesmo negando', () => {
    // Detectar negação por regex é frágil e falha nos dois sentidos. Preferimos
    // bloquear e obrigar quem envia a declarar a intenção via allow.
    expect(lintOutbound(correcao).ok).toBe(false);
  });

  test('allow libera a família, e só ela', () => {
    const r = lintOutbound(correcao, { allow: ['gorjeta-direta'] });
    expect(r.ok).toBe(true);

    // allow não é interruptor geral: outra família continua barrando.
    const comPreco = correcao + ' Custa R$ 497 por mês.';
    const r2 = lintOutbound(comPreco, { allow: ['gorjeta-direta'] });
    expect(r2.ok).toBe(false);
    expect(r2.violations.map((v) => v.id)).toContain('preco-inventado');
  });
});

// ------------------------------------------------- demais famílias
describe('outras famílias de claim proibido', () => {
  test.each([
    ['taxa-consumidor', 'É rapidinho, e o cliente paga uma taxa de conveniência de 2%.'],
    ['agenda-do-fundador', 'O fundador não faz reunião, o teste é self-service mesmo.'],
    ['adocao-prometida', 'Na prática 80% de adesão logo no primeiro mês, pode confiar.'],
    ['linguagem-de-carteira', 'O dinheiro fica com a gente até o fechamento do dia.'],
    ['preco-inventado', 'Depois do piloto custa R$ 299 por mês, fechado.'],
  ])('%s é detectada', (id, texto) => {
    const r = lintOutbound(texto);
    expect(r.ok).toBe(false);
    expect(r.violations.map((v) => v.id)).toContain(id);
  });

  test('toda família tem um porquê escrito, não só um regex', () => {
    // Sem o motivo junto, alguém "conserta" o bloqueio removendo o guard.
    for (const fam of FAMILIES) {
      expect(typeof fam.why).toBe('string');
      expect(fam.why.length).toBeGreaterThan(60);
      expect(fam.patterns.length).toBeGreaterThan(0);
    }
  });
});

// ------------------------------------------------- o caminho de envio
describe('assertOutbound falha fechado', () => {
  test('estoura com code CLAIM_BLOCKED e lista as violações', () => {
    expect.assertions(3);
    try {
      assertOutbound(INCIDENTES.founderCloseAntigo);
    } catch (err) {
      expect(err.code).toBe('CLAIM_BLOCKED');
      expect(err.violations.map((v) => v.id)).toContain('gorjeta-direta');
      // A mensagem precisa ENSINAR, senão o próximo dev remove o guard.
      expect(err.message).toMatch(/13\.419/);
    }
  });

  test('texto limpo não estoura', () => {
    expect(() => assertOutbound('Bom dia! Segue o link do demo pra você ver do celular.')).not.toThrow();
  });

  test('entrada não-string não quebra o linter', () => {
    expect(lintOutbound(null).ok).toBe(true);
    expect(lintOutbound(undefined).ok).toBe(true);
    expect(lintOutbound(42).ok).toBe(true);
  });
});
