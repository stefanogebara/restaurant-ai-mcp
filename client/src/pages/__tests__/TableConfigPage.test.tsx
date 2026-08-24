import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { renderWithProviders } from '../../test/renderWithProviders';
import type { TableConfig } from '../../services/api';

vi.mock('../../components/layout/DashboardLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const listTables = vi.fn();
vi.mock('../../services/api', async (orig) => {
  const actual = await orig<typeof import('../../services/api')>();
  return {
    ...actual,
    tableConfigAPI: {
      listTables: () => listTables(),
      createTable: vi.fn(),
      updateTable: vi.fn(),
      deleteTable: vi.fn(),
      setAdjacency: vi.fn(),
    },
  };
});

import TableConfigPage from '../TableConfigPage';

const mkTable = (over: Partial<TableConfig> = {}): TableConfig => ({
  id: 't1',
  table_number: 1,
  capacity: 4,
  location: 'Indoor',
  status: 'Available',
  is_active: true,
  is_fixed: false,
  min_capacity: 1,
  max_capacity: null,
  adjacent_tables: [],
  combination_group: null,
  shape: 'round',
  position_x: 0,
  position_y: 0,
  ...over,
});

function respondWith(tables: TableConfig[]) {
  listTables.mockResolvedValue({
    data: {
      success: true,
      tables,
      stats: { total: tables.length, active: tables.length, total_capacity: 8, locations: ['Indoor'] },
    },
  });
}

const renderPage = () =>
  renderWithProviders(<MemoryRouter><TableConfigPage /></MemoryRouter>);

/**
 * A seção da planta. Buscar pelo TEXTO "Floor plan" casaria também com o
 * link "Edit Floor Plan" ao lado; o papel de cabeçalho desambigua.
 */
async function findPlan(): Promise<HTMLElement> {
  const heading = await screen.findByRole('heading', { name: /floor plan|planta do salão/i });
  return heading.closest('section') as HTMLElement;
}

describe('TableConfigPage — planta do salão', () => {
  beforeEach(() => listTables.mockReset());

  it('desenha a planta com as mesas ativas', async () => {
    respondWith([mkTable({ position_x: 3, position_y: 2 }), mkTable({ id: 't2', table_number: 2, position_x: 6, position_y: 2 })]);
    renderPage();

    const plan = await findPlan();
    // Os números das mesas são desenhados dentro do SVG da planta.
    expect(within(plan).getAllByText('1').length).toBeGreaterThan(0);
    expect(within(plan).getAllByText('2').length).toBeGreaterThan(0);
  });

  it('avisa que a disposição é automática quando ninguém posicionou o salão', async () => {
    respondWith([mkTable({ position_x: 0, position_y: 0 })]);
    renderPage();

    // Sem posição deliberada, a planta é um palpite — dizer isso evita que o
    // host confie num desenho que não corresponde ao salão dele.
    expect(await screen.findByText(/automatic layout|disposição automática/i)).toBeInTheDocument();
  });

  it('esconde o aviso quando as mesas têm posição real', async () => {
    respondWith([mkTable({ position_x: 5, position_y: 3 })]);
    renderPage();

    await findPlan();
    expect(screen.queryByText(/automatic layout|disposição automática/i)).not.toBeInTheDocument();
  });

  it('clicar numa mesa da planta abre a edição dela', async () => {
    const user = userEvent.setup();
    respondWith([mkTable({ table_number: 7, position_x: 4, position_y: 1 })]);
    renderPage();

    const plan = await findPlan();
    const tableShape = within(plan).getAllByText('7')[0];
    await user.click(tableShape);

    // A planta não é decorativa: leva à mesma edição dos cartões.
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
  });

  it('não desenha planta quando não há mesa alguma', async () => {
    respondWith([]);
    renderPage();

    expect(await screen.findByText(/no tables|nenhuma mesa/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /floor plan|planta do salão/i })).not.toBeInTheDocument();
  });
});
