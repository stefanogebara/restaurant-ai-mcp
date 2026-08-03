/**
 * Trava contra a divergência que motivou prospect-dry-run.js.
 *
 * A regra estava escrita duas vezes com sinais opostos no caso da variável
 * ausente — e as duas cópias CONCORDAVAM quando ela estava definida, que é
 * por isso que o defeito sobreviveu meses: só aparecia no estado seguro,
 * exatamente o estado em que ninguém confere.
 *
 * O teste que importa é o da ausência. Os outros são companhia.
 */

const { isDryRun } = require('../_lib/prospecting/prospect-dry-run');

const COM_NUMERO = { PROSPECTING_PHONE_NUMBER_ID: '123456789' };

describe('isDryRun — régua única de envio', () => {
  it('AUSENTE => dry-run LIGADO (o caso em que as duas cópias divergiam)', () => {
    expect(isDryRun({ ...COM_NUMERO })).toBe(true);
  });

  it("só a string exata 'false' libera o envio", () => {
    expect(isDryRun({ ...COM_NUMERO, PROSPECTING_DRY_RUN: 'false' })).toBe(false);
  });

  it('dry-run ligado explicitamente segura o envio', () => {
    expect(isDryRun({ ...COM_NUMERO, PROSPECTING_DRY_RUN: 'true' })).toBe(true);
  });

  // Fail-safe: qualquer variação que um humano digitaria por engano tem que
  // SEGURAR o envio, nunca liberar. Errar para o lado de não mandar é barato.
  it.each(['False', 'FALSE', ' false', 'false ', '0', '', 'nao', 'no'])(
    'valor ambíguo %p segura o envio',
    (valor) => {
      expect(isDryRun({ ...COM_NUMERO, PROSPECTING_DRY_RUN: valor })).toBe(true);
    },
  );

  it('sem número de origem provisionado, nada sai — nem com a flag em false', () => {
    expect(isDryRun({ PROSPECTING_DRY_RUN: 'false' })).toBe(true);
  });

  it('env vazio ou nulo não explode e segura o envio', () => {
    expect(isDryRun({})).toBe(true);
    expect(isDryRun(null)).toBe(true);
  });
});

describe('quem decide o envio e quem reporta no painel são a MESMA função', () => {
  // Asserção de IDENTIDADE, não de concordância. Duas implementações que hoje
  // concordam podem divergir amanhã — foi assim que o defeito nasceu, com as
  // cópias batendo em todos os casos menos o da variável ausente. Exigir a
  // mesma referência é a única trava que uma recópia não consegue passar.
  it('sequencer.isDryRun é a régua compartilhada, não uma cópia', () => {
    const seq = require('../_lib/prospecting/sequencer');
    expect(seq.isDryRun).toBe(isDryRun);
  });

  it('a sonda do painel importa a mesma régua', () => {
    const daSonda = require('../_lib/prospecting/prospect-dry-run').isDryRun;
    expect(daSonda).toBe(isDryRun);
  });
});
