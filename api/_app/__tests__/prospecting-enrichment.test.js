'use strict';

/**
 * Phase 3 — BR enrichment pure-module tests. The CNPJ-match cases encode the
 * exact wrong-match bugs Olivia hit in production (now regression-guarded):
 *   "Lellis Trattoria" → "BANANA BOAT" (weak name, no phone) → reject
 *   a CLOSED company auto-accepted with confidence=1 → gated by situação
 *   out-of-city homonym auto-accepted → requires ≥2 shared tokens
 */

const {
  cnpjValido, extrairCnpjsDeHtml, situacaoAtiva, gateCandidato,
  nomeSimilaridade, telefonesBatem, cnaeImplausivel, scoreCandidato,
} = require('../_lib/prospecting/prospect-cnpj-match');
const {
  calcularLeadScore, classificarBioSinais, parseGenero,
  parseEnderecoFormatado, extractContactLinks,
} = require('../_lib/prospecting/prospect-enrich-signals');
const {
  instagramHandleFromUrl, handleFromHtml, handleCasaNome,
} = require('../_lib/prospecting/prospect-instagram');
const { buscarCnpjLocal } = require('../_lib/prospecting/prospect-cnpj-local');

describe('cnpjValido (mod-11)', () => {
  it('accepts a valid CNPJ (check digits verified by hand: …61)', () => {
    expect(cnpjValido('11444777000161')).toBe(true);
    expect(cnpjValido('11.444.777/0001-61')).toBe(true);
  });
  it('rejects a wrong check digit, repeated digits, and wrong length', () => {
    expect(cnpjValido('11444777000160')).toBe(false);
    expect(cnpjValido('00000000000000')).toBe(false);
    expect(cnpjValido('1234')).toBe(false);
    expect(cnpjValido('')).toBe(false);
  });
});

describe('extrairCnpjsDeHtml', () => {
  it('extracts valid CNPJs from visible footer text, dedupes, strips scripts', () => {
    const html = `
      <html><body>
        <footer>CNPJ: 11.444.777/0001-61</footer>
        <script>var x = "99.999.999/9999-99";</script>
        <p>also 11444777000161 again</p>
        <p>invalid 11.444.777/0001-60</p>
      </body></html>`;
    expect(extrairCnpjsDeHtml(html)).toEqual(['11444777000161']);
  });
  it('returns [] for empty/nullish input', () => {
    expect(extrairCnpjsDeHtml(null)).toEqual([]);
    expect(extrairCnpjsDeHtml('')).toEqual([]);
  });
});

describe('situacaoAtiva / gateCandidato', () => {
  it('ATIVA → true, BAIXADA → false, unknown → null', () => {
    expect(situacaoAtiva('ATIVA')).toBe(true);
    expect(situacaoAtiva('Ativa')).toBe(true);
    expect(situacaoAtiva('BAIXADA')).toBe(false);
    expect(situacaoAtiva('')).toBe(null);
    expect(situacaoAtiva(null)).toBe(null);
  });
  it('gate rejects a CLOSED company but passes ATIVA / unknown', () => {
    expect(gateCandidato({ cidade: 'São Paulo' }, { situacao: 'BAIXADA', municipio: 'São Paulo' }))
      .toMatch(/não ATIVA/);
    expect(gateCandidato({ cidade: 'São Paulo' }, { situacao: 'ATIVA', municipio: 'Rio' })).toBe(null);
    expect(gateCandidato({ cidade: 'São Paulo' }, { situacao: null, municipio: null })).toBe(null);
  });
});

describe('nomeSimilaridade (stopword-aware Jaccard/coverage)', () => {
  it('ignores generic trade words and rewards brand-token overlap', () => {
    // "trattoria"/"bar"/"lanches" are stopwords → "Lellis" vs "Banana Boat" share nothing
    expect(nomeSimilaridade('Lellis Trattoria', 'BANANA BOAT BAR E LANCHES', null)).toBe(0);
    // 1-word brand fully covered by a long razão social → coverage 1.0
    expect(nomeSimilaridade('Selvvva', 'SELVVVA PLANTAS E OBJETOS LTDA', null)).toBe(1);
  });
});

describe('telefonesBatem (Google × Receita phone cross-match)', () => {
  it('matches national numbers regardless of DDI/format, fails on short', () => {
    expect(telefonesBatem('+55 11 99002-1234', '5511990021234')).toBe(true);
    expect(telefonesBatem('11990021234', '(11) 99002-1234')).toBe(true);
    expect(telefonesBatem('11990021234', '11990025678')).toBe(false);
    expect(telefonesBatem('1234', '1234')).toBe(false);
    expect(telefonesBatem(null, '11990021234')).toBe(false);
  });
});

describe('scoreCandidato — the anti-hallucination decision matrix', () => {
  const lead = { nome: 'Criminal Burguer', telefone: '11990021234', cidade: 'São Paulo' };

  it('PHONE MATCH → accept even if the establishment is closed elsewhere', () => {
    const sig = scoreCandidato(lead, {
      razao_social: 'CRIMINAL HAMBURGUERIA LTDA', nome_fantasia: 'Criminal Burguer',
      telefone: '11990021234', cnae: 'Lanchonetes', municipio: 'Guarulhos',
    });
    expect(sig.phoneMatch).toBe(true);
    expect(sig.decision).toBe('accept');
  });

  it('REJECT a plausible-but-wrong match: weak name + no phone (the Lellis bug)', () => {
    const sig = scoreCandidato(
      { nome: 'Lellis Trattoria', telefone: '1133334444', cidade: 'São Paulo' },
      { razao_social: 'BANANA BOAT BAR E LANCHES LTDA', nome_fantasia: 'Banana Boat',
        telefone: '1199998888', cnae: 'Bar', municipio: 'São Paulo' },
    );
    expect(sig.nameSim).toBe(0);
    expect(sig.decision).toBe('reject');
  });

  it('REJECT a shell-company CNAE with a weak name', () => {
    const sig = scoreCandidato(
      { nome: 'Criminal Burguer', telefone: null, cidade: 'São Paulo' },
      { razao_social: 'XYZ ASSESSORIA E APOIO ADMINISTRATIVO LTDA', nome_fantasia: null,
        telefone: null, cnae: 'Atividades de assessoria em gestão', municipio: 'São Paulo' },
    );
    expect(sig.cnaeBad).toBe(true);
    expect(sig.decision).toBe('reject');
  });

  it('ACCEPT a strong out-of-city brand with ≥2 shared tokens (Padoca do Gael)', () => {
    const sig = scoreCandidato(
      { nome: 'Padoca do Gael', telefone: null, cidade: 'São Paulo' },
      { razao_social: 'PADOCA DO GAEL LTDA', nome_fantasia: 'Padoca do Gael',
        telefone: null, cnae: 'Padaria', municipio: 'Dourados' },
    );
    expect(sig.nameSim).toBeGreaterThanOrEqual(0.8);
    expect(sig.decision).toBe('accept');
  });

  it('does NOT auto-accept a 1-generic-token out-of-city homonym (Padaria Central)', () => {
    const sig = scoreCandidato(
      { nome: 'Padaria Central', telefone: null, cidade: 'São Paulo' },
      { razao_social: 'PADARIA CENTRAL LTDA', nome_fantasia: 'Padaria Central',
        telefone: null, cnae: 'Padaria', municipio: 'Belo Horizonte' },
    );
    expect(sig.decision).toBe('judge'); // only "central" in common → not auto-accepted
  });

  it('cnaeImplausivel flags shell/holding activities only', () => {
    expect(cnaeImplausivel('Holding de instituições não-financeiras')).toBe(true);
    expect(cnaeImplausivel('Restaurantes e similares')).toBe(false);
  });
});

describe('calcularLeadScore (additive 0..7)', () => {
  it('weights: physical 1, delivery 2, whatsapp 3, owner 1', () => {
    expect(calcularLeadScore({ pontoFisico: true, deliveryProprio: true, whatsappVendas: true, donoIdentificado: true })).toBe(7);
    expect(calcularLeadScore({ pontoFisico: false, deliveryProprio: false, whatsappVendas: false, donoIdentificado: false })).toBe(0);
    expect(calcularLeadScore({ pontoFisico: true, deliveryProprio: false, whatsappVendas: true, donoIdentificado: false })).toBe(4);
  });
});

describe('classificarBioSinais (anti-false-positive)', () => {
  it('wa.me link → whatsappVendas; bare number → false', () => {
    expect(classificarBioSinais('Peça pelo link wa.me/5511999', null).whatsappVendas).toBe(true);
    expect(classificarBioSinais('Tel 11 99999-9999', null).whatsappVendas).toBe(false);
  });
  it('own-delivery phrase → true; aggregator-only → false', () => {
    expect(classificarBioSinais('Entregamos em toda a zona sul', null).deliveryProprio).toBe(true);
    expect(classificarBioSinais('Peça no iFood e no Rappi', null).deliveryProprio).toBe(false);
  });
  it('detects linktree in text or external_url', () => {
    expect(classificarBioSinais('link na bio', 'https://linktr.ee/loja').linktree).toBe(true);
    expect(classificarBioSinais('beacons.ai/loja', null).linktree).toBe(true);
  });
});

describe('parseGenero (defaults to f)', () => {
  it('maps unambiguous answers, defaults uncertain/empty to f', () => {
    expect(parseGenero('m')).toBe('m');
    expect(parseGenero('masculino')).toBe('m');
    expect(parseGenero('f')).toBe('f');
    expect(parseGenero('feminino')).toBe('f');
    expect(parseGenero('')).toBe('f');
    expect(parseGenero('sei lá')).toBe('f');
    expect(parseGenero(null)).toBe('f');
  });
});

describe('parseEnderecoFormatado', () => {
  it('extracts real bairro + cidade from a formatted address', () => {
    expect(parseEnderecoFormatado('Rua Augusta, 1500 - Consolação, São Paulo - SP, 01304-001, Brazil'))
      .toEqual({ bairro: 'Consolação', cidade: 'São Paulo' });
  });
  it('does not treat a lone number as a neighborhood; returns null on unknown shape', () => {
    expect(parseEnderecoFormatado('Av. Paulista, São Paulo - SP, 01310-000, Brazil').bairro).toBe(null);
    expect(parseEnderecoFormatado('just some text')).toBe(null);
    expect(parseEnderecoFormatado(null)).toBe(null);
  });
});

describe('extractContactLinks (same-origin only)', () => {
  it('finds contact pages by url or text, ignores third-party + cross-origin', () => {
    const html = `
      <a href="/contato">Atendimento</a>
      <a href="https://other.com/contato">Fale conosco</a>
      <a href="/fale-conosco">Quem somos</a>
      <a href="/menu">Cardápio</a>`;
    const links = extractContactLinks(html, 'https://loja.com.br');
    expect(links).toContain('https://loja.com.br/contato');
    expect(links).toContain('https://loja.com.br/fale-conosco');
    expect(links.some((u) => u.includes('other.com'))).toBe(false);
    expect(links.length).toBeLessThanOrEqual(3);
  });
});

describe('instagram handle parsers', () => {
  it('instagramHandleFromUrl ignores reserved paths', () => {
    expect(instagramHandleFromUrl('https://instagram.com/docerialoja')).toBe('docerialoja');
    expect(instagramHandleFromUrl('https://instagram.com/p/abc123')).toBe(null);
    expect(instagramHandleFromUrl('https://example.com')).toBe(null);
  });
  it('handleFromHtml takes the first valid handle from site HTML', () => {
    const html = '<a href="https://instagram.com/reel/x">r</a><a href="https://instagram.com/minhaloja">ig</a>';
    expect(handleFromHtml(html)).toBe('minhaloja');
    expect(handleFromHtml(null)).toBe(null);
  });
  it('handleCasaNome scores exact=1, contained=0.8, token fraction otherwise', () => {
    expect(handleCasaNome('docerialoja', 'Doceria Loja')).toBe(1);
    expect(handleCasaNome('docerialojasp', 'Doceria Loja')).toBe(0.8);
    expect(handleCasaNome('outracoisa', 'Doceria Loja')).toBe(0);
  });
});

describe('buscarCnpjLocal (RPC wrapper, degrades to [])', () => {
  it('short name → [] without calling the RPC', async () => {
    const calls = [];
    const supa = { rpc: async (fn, args) => { calls.push([fn, args]); return { data: [], error: null }; } };
    expect(await buscarCnpjLocal(supa, 'ab', 'São Paulo')).toEqual([]);
    expect(calls.length).toBe(0);
  });
  it('rpc error → []; rpc array → passthrough', async () => {
    const ok = { rpc: async () => ({ data: [{ cnpj: '11444777000161', sim: 0.9 }], error: null }) };
    const err = { rpc: async () => ({ data: null, error: { message: 'boom' } }) };
    expect(await buscarCnpjLocal(ok, 'Doceria Maria', 'São Paulo')).toHaveLength(1);
    expect(await buscarCnpjLocal(err, 'Doceria Maria', 'São Paulo')).toEqual([]);
  });
});
