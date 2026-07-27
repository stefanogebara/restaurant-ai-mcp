'use strict';

/**
 * Cerca geográfica da descoberta (bug encontrado em 2026-07-27).
 *
 * Sintoma: a base "São Paulo" continha restaurante do RS, MS e PA — 'Amazônia
 * na Cuia' (Belém) apareceu como lead paulistano. Duas causas:
 *   1. a requisição não mandava locationRestriction; a geografia era só o texto
 *      da busca ("... em São Paulo, SP"), que o Google trata como DICA;
 *   2. normalizePlace carimbava `city: ctx.city` — a cidade PROCURADA, não a do
 *      lugar. O dado mentia: 358 leads diziam "São Paulo, SP" com DDD de outro
 *      estado.
 *
 * Consequência: mensagem paga disparada pra fora da praça e métrica poluída.
 */

const {
  boundsParaCidade, dentroDoRetangulo, cidadeDoEndereco, normalizePlace,
} = require('../_lib/prospecting/places-discovery');

const SP = boundsParaCidade('São Paulo, SP');

describe('boundsParaCidade — retângulo da praça', () => {
  test('reconhece São Paulo com e sem acento/UF', () => {
    for (const nome of ['São Paulo, SP', 'sao paulo', 'SÃO PAULO/SP', 'São Paulo']) {
      expect(boundsParaCidade(nome)).toBeTruthy();
    }
  });

  test('cidade sem retângulo cadastrado → null (busca segue, sem cerca)', () => {
    expect(boundsParaCidade('Belém, PA')).toBeNull();
    expect(boundsParaCidade('')).toBeNull();
    expect(boundsParaCidade(null)).toBeNull();
  });
});

describe('dentroDoRetangulo — a checagem que barra o lead de fora', () => {
  test('Sé (centro de SP) está dentro; Belém e Porto Alegre, fora', () => {
    expect(dentroDoRetangulo(-23.5505, -46.6333, SP)).toBe(true);   // Sé
    expect(dentroDoRetangulo(-1.4558, -48.4902, SP)).toBe(false);   // Belém/PA
    expect(dentroDoRetangulo(-30.0346, -51.2177, SP)).toBe(false);  // Porto Alegre/RS
    expect(dentroDoRetangulo(-20.4697, -54.6201, SP)).toBe(false);  // Campo Grande/MS
  });

  test('coordenada faltando → false (não deixa passar por omissão)', () => {
    expect(dentroDoRetangulo(null, -46.6, SP)).toBe(false);
    expect(dentroDoRetangulo(-23.5, undefined, SP)).toBe(false);
  });

  test('sem retângulo → true (não barra praça que não cadastramos)', () => {
    expect(dentroDoRetangulo(-1.45, -48.49, null)).toBe(true);
  });
});

describe('cidadeDoEndereco — a cidade REAL, não a procurada', () => {
  test('extrai cidade e UF do formattedAddress do Google', () => {
    expect(cidadeDoEndereco('R. Augusta, 123 - Consolação, São Paulo - SP, 01305-000, Brasil'))
      .toBe('São Paulo, SP');
    expect(cidadeDoEndereco('Av. Nazaré, 500 - Nazaré, Belém - PA, 66035-170, Brasil'))
      .toBe('Belém, PA');
  });

  test('endereço fora do padrão → null (melhor não saber que inventar)', () => {
    expect(cidadeDoEndereco('rua sem formato')).toBeNull();
    expect(cidadeDoEndereco(null)).toBeNull();
  });
});

describe('normalizePlace — para de carimbar a cidade procurada', () => {
  const lugar = (over = {}) => ({
    id: 'p1',
    displayName: { text: 'Restaurante Teste' },
    formattedAddress: 'R. Augusta, 123 - Consolação, São Paulo - SP, 01305-000, Brasil',
    location: { latitude: -23.5505, longitude: -46.6333 },
    types: ['restaurant'],
    userRatingCount: 100,
    ...over,
  });

  test('usa a cidade do ENDEREÇO, não a da busca', () => {
    const lead = normalizePlace(lugar(), { city: 'São Paulo, SP', sector: 'restaurante' });
    expect(lead.city).toBe('São Paulo, SP');

    // o caso que gerou o bug: busca diz SP, lugar é de Belém
    const forasteiro = normalizePlace(
      lugar({ formattedAddress: 'Av. Nazaré, 500 - Nazaré, Belém - PA, 66035-170, Brasil' }),
      { city: 'São Paulo, SP', sector: 'restaurante' },
    );
    expect(forasteiro.city).toBe('Belém, PA'); // a verdade, não o carimbo
  });

  test('sem cidade no endereço, cai pra da busca (comportamento antigo como fallback)', () => {
    const lead = normalizePlace(lugar({ formattedAddress: 'rua sem formato' }), { city: 'São Paulo, SP' });
    expect(lead.city).toBe('São Paulo, SP');
  });

  test('fora do retângulo → descartado quando a cerca é passada', () => {
    const dentro = normalizePlace(lugar(), { city: 'São Paulo, SP', bounds: SP });
    expect(dentro).toBeTruthy();

    const fora = normalizePlace(
      lugar({ location: { latitude: -1.4558, longitude: -48.4902 } }),
      { city: 'São Paulo, SP', bounds: SP },
    );
    expect(fora).toBeNull(); // Belém não entra numa varredura de SP
  });

  // A cerca só descarta o que dá pra PROVAR que está fora — perder lead bom
  // por metadado faltando é pior que revisar um duvidoso.
  test('sem coordenada, decide pelo endereço', () => {
    const semCoordSP = normalizePlace(
      { ...lugar(), location: undefined },
      { city: 'São Paulo, SP', bounds: SP },
    );
    expect(semCoordSP).toBeTruthy(); // endereço diz SP → entra

    const semCoordPA = normalizePlace(
      { ...lugar(), location: undefined, formattedAddress: 'Av. Nazaré, 500 - Nazaré, Belém - PA, 66035-170, Brasil' },
      { city: 'São Paulo, SP', bounds: SP },
    );
    expect(semCoordPA).toBeNull(); // endereço prova que está fora → descarta
  });

  test('sem coordenada E sem endereço legível → passa (não descarta por omissão)', () => {
    const cego = normalizePlace(
      { id: 'p9', displayName: { text: 'Bar Sem Dados' }, types: ['restaurant'], location: undefined, formattedAddress: null },
      { city: 'São Paulo, SP', bounds: SP },
    );
    expect(cego).toBeTruthy();
  });
});
