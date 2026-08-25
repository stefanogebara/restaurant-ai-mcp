/**
 * toTileType — os três vocabulários que chegavam ao Passo 1 e faziam a
 * cozinha real virar 'other' no banco (auditoria 24/ago).
 */
import { describe, it, expect } from 'vitest';
import { toTileType } from '../restaurantTypeSlug';

describe('toTileType', () => {
  it('enum do demo (underscore) vira tile slug', () => {
    expect(toTileType('casual_dining')).toBe('casual-dining');
    expect(toTileType('fine_dining')).toBe('fine-dining');
    expect(toTileType('fast_casual')).toBe('fast-casual');
  });

  it('tile slugs passam intactos', () => {
    for (const s of ['pizzeria', 'steakhouse', 'bistro', 'cafe', 'bar', 'seafood', 'other', 'casual-dining']) {
      expect(toTileType(s)).toBe(s);
    }
  });

  it('cozinhas do enum do banco são preservadas (não degradam para other)', () => {
    expect(toTileType('italian')).toBe('italian');
    expect(toTileType('Italian restaurant')).toBe('italian');
    expect(toTileType('japanese')).toBe('japanese');
    expect(toTileType('Sushi bar')).toBe('japanese');
    expect(toTileType('mexican')).toBe('mexican');
  });

  it('texto livre do Google mapeia por heurística', () => {
    expect(toTileType('Pizza restaurant')).toBe('pizzeria');
    expect(toTileType('Churrascaria')).toBe('steakhouse');
    expect(toTileType('Coffee shop')).toBe('cafe');
    expect(toTileType('Fine dining restaurant')).toBe('fine-dining');
    expect(toTileType('Brazilian restaurant')).toBe('casual-dining');
    expect(toTileType('Restaurant')).toBe('casual-dining');
  });

  it('vazio/nulo devolve vazio (nada de forçar um tipo)', () => {
    expect(toTileType('')).toBe('');
    expect(toTileType(null)).toBe('');
    expect(toTileType(undefined)).toBe('');
  });
});
