import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Paridade demo ↔ produto pago no perfil do cliente.
 *
 * O `CustomerProfileDrawer`, `/api/guest-context` e `/api/ltv` existiam,
 * estavam testados e ficaram ligados SÓ na `DemoDashboard`. O `Dashboard.tsx`
 * do restaurante pagante importava a MESMA `ReservationsList`, não passava
 * `onCustomerClick` e não montava o drawer — ou seja, o prospect via na demo
 * um recurso que o cliente que paga não tinha. A inversão é o que torna isso
 * pior que um recurso faltando.
 *
 * Nada de tipo, lint ou teste de unidade pegava isso: as duas telas
 * compilavam, e a que faltava simplesmente omitia uma prop opcional. Por isso
 * o guarda lê a fonte das duas telas e exige que andem juntas.
 */
const pages = join(__dirname, '..');
const read = (f: string) => readFileSync(join(pages, f), 'utf-8');

describe('perfil do cliente na hora de sentar', () => {
  const surfaces = ['Dashboard.tsx', 'DemoDashboard.tsx'];

  it.each(surfaces)('%s monta o CustomerProfileDrawer', (file) => {
    const src = read(file);
    expect(src).toMatch(/import CustomerProfileDrawer from/);
    expect(src).toMatch(/<CustomerProfileDrawer/);
  });

  it.each(surfaces)('%s passa onCustomerClick para a ReservationsList', (file) => {
    const src = read(file);
    const at = src.indexOf('<ReservationsList');
    expect(at).toBeGreaterThan(-1);
    // Recorta só o bloco de props da lista para não aceitar um
    // onCustomerClick que estivesse em outro componente da mesma página.
    const props = src.slice(at, src.indexOf('/>', at));
    expect(props).toMatch(/onCustomerClick=/);
  });
});
