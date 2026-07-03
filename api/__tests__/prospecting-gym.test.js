/**
 * Phase 10 — Olímpia Gym (pure logic).
 *
 * Guards: judge-rubric parsing (clamps, garbage tolerance), sim-lead persona
 * prompt assembly, and the style-pack injection into the production prompt.
 */

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
}));

const { parseJudgeText, parsePairedText, simLeadSystem, RUBRICA } = require('../_lib/prospecting/prospect-sim');
const { buildSystemPrompt } = require('../_lib/prospecting/prospect-agent');

// ============================================================ judge parsing
describe('parseJudgeText — rubric scores (clamped, garbage-tolerant)', () => {
  test('parses a full judgment and computes the mean', () => {
    const s = parseJudgeText(JSON.stringify({
      humanidade: 4, naturalidade: 5, sobriedade: 3, bolhas: 2,
      repeticao: 4, avanco: 4, adaptacao: 4,
      tags: ['bolhas fracas', 'boa condução'], veredicto: 'Conduz bem; usa pouco as bolhas.',
    }));
    expect(s.humanidade).toBe(4);
    expect(s.bolhas).toBe(2);
    expect(s.media).toBeCloseTo(3.71, 1);
    expect(s.tags).toContain('bolhas fracas');
  });

  test('clamps out-of-range values into 1..5', () => {
    const s = parseJudgeText('{"humanidade": 11, "naturalidade": -3, "sobriedade": 4.6}');
    expect(s.humanidade).toBe(5);
    expect(s.naturalidade).toBe(1);
    expect(s.sobriedade).toBe(5);
  });

  test('tolerates markdown fences + surrounding prose', () => {
    const s = parseJudgeText('Claro!\n```json\n{"humanidade": 3, "tags": []}\n```');
    expect(s.humanidade).toBe(3);
  });

  test('garbage → null (never invents scores)', () => {
    expect(parseJudgeText('não sei avaliar')).toBeNull();
    expect(parseJudgeText('')).toBeNull();
  });

  test('rubric covers exactly the founder asks', () => {
    expect(RUBRICA).toEqual(['humanidade', 'naturalidade', 'sobriedade', 'bolhas', 'repeticao', 'avanco', 'adaptacao']);
  });
});

// ============================================================ paired judging
describe('parsePairedText — head-to-head verdicts (cycle-4 variance fix)', () => {
  test('parses a clean verdict', () => {
    const v = parsePairedText('{"vencedor":"B","margem":2,"motivo":"B trata a objeção; A re-pitcha."}');
    expect(v).toEqual({ vencedor: 'B', margem: 2, motivo: 'B trata a objeção; A re-pitcha.' });
  });

  test('empate forces margem 0; wins force margem ≥1', () => {
    expect(parsePairedText('{"vencedor":"empate","margem":3}').margem).toBe(0);
    expect(parsePairedText('{"vencedor":"A","margem":0}').margem).toBe(1);
  });

  test('clamps margem into 0..3 and tolerates fences', () => {
    const v = parsePairedText('claro:\n```json\n{"vencedor":"A","margem":9}\n```');
    expect(v.margem).toBe(3);
  });

  test('invalid winner / garbage → null (never invents a verdict)', () => {
    expect(parsePairedText('{"vencedor":"C","margem":1}')).toBeNull();
    expect(parsePairedText('os dois foram bem')).toBeNull();
    expect(parsePairedText('')).toBeNull();
  });
});

// ============================================================ sim persona
describe('simLeadSystem — persona prompt assembly', () => {
  test('embeds perfil, humor, estilo, objetivo and curveballs', () => {
    const sys = simLeadSystem({
      lead: { name: 'Boteco do Chico' },
      persona: {
        perfil: 'dono ocupado', humor: 'apressado', estilo: 'bolhas curtas',
        objetivo: 'só continua se for rápido', curveballs: ['responde algo do restaurante por engano'],
      },
    });
    expect(sys).toMatch(/Boteco do Chico/);
    expect(sys).toMatch(/dono ocupado/);
    expect(sys).toMatch(/bolhas curtas/);
    expect(sys).toMatch(/por engano/);
    expect(sys).toMatch(/linha em branco/); // multi-bubble simulation instruction
  });

  test('degrades gracefully without curveballs', () => {
    const sys = simLeadSystem({ lead: { name: 'X' }, persona: {} });
    expect(sys).not.toMatch(/EVENTOS QUE VOCÊ DEVE ENCAIXAR/);
  });
});

// ============================================================ style injection
describe('buildSystemPrompt — style-pack layer', () => {
  const lead = { name: 'Cantina', sector: 'restaurante', city: 'SP', nome_genero: 'f' };

  test('appends the style body at the end when provided', () => {
    const prompt = buildSystemPrompt(lead, undefined, 'ESTILO DE ESCRITA:\nB1. BOLHAS: quebre em 2-3 mensagens.');
    expect(prompt).toMatch(/ESTILO DE ESCRITA/);
    expect(prompt.indexOf('ESTILO DE ESCRITA')).toBeGreaterThan(prompt.indexOf('FERRAMENTAS'));
  });

  test('identical to baseline when style is null/empty (no drift)', () => {
    expect(buildSystemPrompt(lead, undefined, null)).toBe(buildSystemPrompt(lead));
    expect(buildSystemPrompt(lead, undefined, '  ')).toBe(buildSystemPrompt(lead));
  });
});
