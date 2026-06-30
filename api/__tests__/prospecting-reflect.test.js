'use strict';

/**
 * Phase 5 — memory (fact extraction) + outcome scoring parsers. These are the
 * tolerant, anti-garbage parsers that turn an LLM reply into safe structured data;
 * the LLM calls themselves are exercised in production.
 */

const { transcriptFromHistory, parseFatosText, parseScoreText } = require('../_lib/prospecting/prospect-reflect');

describe('transcriptFromHistory', () => {
  it('labels inbound as LEAD and outbound as the agent, in order', () => {
    const t = transcriptFromHistory([
      { direcao: 'in', corpo: 'oi', tipo: 'text' },
      { direcao: 'out', corpo: 'olá!', tipo: 'text' },
      { direcao: 'in', corpo: null, tipo: 'image' },
    ]);
    const lines = t.split('\n');
    expect(lines[0]).toBe('LEAD: oi');
    expect(lines[1]).toMatch(/^OL[IÍ]MPIA: olá!$/i);
    expect(lines[2]).toBe('LEAD: [image]');
  });
});

describe('parseFatosText — declared facts (coerced, anti-invention)', () => {
  it('parses clean JSON and keeps only valid fields', () => {
    const f = parseFatosText('{"is_dono":true,"email":"a@b.com","objecoes":["acha caro"],"lixo":123}');
    expect(f.is_dono).toBe(true);
    expect(f.email).toBe('a@b.com');
    expect(f.objecoes).toEqual(['acha caro']);
    expect(f).not.toHaveProperty('lixo');
  });
  it('tolerates ```json fences and prose around the object', () => {
    const f = parseFatosText('claro:\n```json\n{"nome_responsavel":"Maria"}\n```');
    expect(f.nome_responsavel).toBe('Maria');
  });
  it('garbage / empty → {} (never throws, never invents)', () => {
    expect(parseFatosText('não sei')).toEqual({});
    expect(parseFatosText('')).toEqual({});
    expect(parseFatosText(null)).toEqual({});
  });
});

describe('parseScoreText — 1–5 quality + theme tags', () => {
  it('accepts an integer 1–5 and string tags (capped, trimmed)', () => {
    const s = parseScoreText('{"quality_score":4,"theme_tags":[" preço ","agendou"]}');
    expect(s.quality_score).toBe(4);
    expect(s.theme_tags).toEqual(['preço', 'agendou']);
  });
  it('rejects out-of-range / non-integer scores → null', () => {
    expect(parseScoreText('{"quality_score":7}').quality_score).toBe(null);
    expect(parseScoreText('{"quality_score":3.5}').quality_score).toBe(null);
    expect(parseScoreText('{"quality_score":"alto"}').quality_score).toBe(null);
  });
  it('garbage → empty result', () => {
    expect(parseScoreText('meh')).toEqual({ quality_score: null, theme_tags: [] });
  });
});
