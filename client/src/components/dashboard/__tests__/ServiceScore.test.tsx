import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import ServiceScore from '../ServiceScore';
import type { Table, ActiveParty, UpcomingReservation } from '../../../types/host.types';

const NOW = new Date(2026, 0, 15, 19, 33);
const localISO = (h: number, m: number) => new Date(2026, 0, 15, h, m).toISOString();

const mkTable = (id: string, num: number, location = 'Indoor'): Table =>
  ({ id, table_number: num, capacity: 4, status: 'Available', shape: 'round', location } as unknown as Table);

const tables = [
  mkTable('t1', 1),
  mkTable('t2', 2),
  mkTable('t7', 7, 'Patio'),
];

const parties: ActiveParty[] = [
  {
    service_id: 's1',
    customer_name: 'Alice Smith',
    customer_phone: '+1',
    party_size: 4,
    tables: ['t1'],
    seated_at: localISO(18, 30),
    estimated_departure: localISO(20, 0),
    time_elapsed_minutes: 63,
    time_remaining_minutes: 27,
    is_overdue: false,
  },
];

const reservations: UpcomingReservation[] = [
  {
    reservation_id: 'r1',
    customer_name: 'Bob Jones',
    customer_phone: '+1',
    party_size: 2,
    date: '2026-01-15',
    time: '19:45',
    reservation_time: '19:45',
    checked_in: false,
    table_ids: ['t1'], // conflita: Alice só sai 20:00
  },
];

const renderScore = (over: Partial<React.ComponentProps<typeof ServiceScore>> = {}) =>
  render(
    <ServiceScore
      tables={tables}
      activeParties={parties}
      todayReservations={reservations}
      now={NOW}
      {...over}
    />,
  );

describe('ServiceScore (A Partitura)', () => {
  it('desenha uma raia para CADA mesa, inclusive as paradas', () => {
    renderScore();
    // A régua compacta mostra só mesas com movimento; a página inteira
    // mostra todas — uma mesa vazia a noite toda é informação.
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getAllByText(/free all night|livre a noite toda/i)).toHaveLength(2);
  });

  it('agrupa as raias por zona do salão', () => {
    renderScore();
    expect(screen.getByText(/indoor/i)).toBeInTheDocument();
    expect(screen.getByText(/patio/i)).toBeInTheDocument();
  });

  it('abre cada raia com a mesa ilustrada e sua capacidade', () => {
    renderScore();
    const lanes = screen.getAllByRole('listitem');
    // A "clave": o número da mesa desenhado dentro do SVG.
    expect(within(lanes[0]).getByText('1')).toBeInTheDocument();
    expect(within(lanes[0]).getByText(/4 (seats|lug\.)/i)).toBeInTheDocument();
  });

  it('mostra grupos na casa e reservas por chegar', () => {
    renderScore();
    expect(screen.getByText('Alice · 4p')).toBeInTheDocument();
    expect(screen.getByText('Bob · 2p')).toBeInTheDocument();
  });

  it('anuncia o conflito mais próximo no topo', () => {
    renderScore();
    const line = screen.getByText(/must be ready at|precisa estar pronta/i).closest('p');
    expect(line?.textContent).toContain('19:45');
    expect(line?.textContent).toContain('20:00');
  });

  it('marca o AGORA com a hora do relógio', () => {
    renderScore();
    expect(screen.getByText(/19:33/)).toBeInTheDocument();
  });

  it('esconde o marcador AGORA quando o relógio está fora da janela', () => {
    // 04:00 da manhã: a janela desenhada é a da noite anterior.
    renderScore({ now: new Date(2026, 0, 15, 4, 0) });
    expect(screen.queryByText(/AGORA|NOW/)).not.toBeInTheDocument();
  });

  it('explica o vazio em vez de sumir da tela', () => {
    renderScore({ activeParties: [], todayReservations: [] });
    expect(screen.getByText(/no movement|nenhum movimento/i)).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });
});
