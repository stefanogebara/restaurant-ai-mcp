import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import FloorPlanView from '../FloorPlanView';
import type { Table } from '../../../types/host.types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback?: string) => fallback || _key }),
}));

const tables = [
  { id: 'one', table_number: 1, capacity: 2, status: 'Available', location: 'Main' },
  { id: 'two', table_number: 2, capacity: 4, status: 'Occupied', location: 'Main' },
  { id: 'three', table_number: 3, capacity: 2, status: 'Reserved', location: 'Main' },
  { id: 'four', table_number: 4, capacity: 2, status: 'Being Cleaned', location: 'Main' },
] as Table[];

describe('FloorPlanView dashboard presentation', () => {
  it('keeps table numbers in a stable order as states change without inventing room coordinates', () => {
    const onTableClick = vi.fn();
    const { container } = render(<FloorPlanView tables={[tables[2], tables[0], tables[3], tables[1]]} autoPresentation="availability" onTableClick={onTableClick} />);

    expect(container.querySelectorAll('[data-table-inventory-glyph]')).toHaveLength(4);
    expect(container.querySelectorAll('[data-seat-marker]')).toHaveLength(10);
    expect(container.querySelector('svg g[role="button"]')).toBeNull();
    expect(screen.queryByText('Needs attention')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button').map(button => button.getAttribute('aria-label'))).toEqual([
      'Table 1, Available, 2 seats',
      'Table 2, Occupied, 4 seats',
      'Table 3, Reserved, 2 seats',
      'Table 4, Cleaning, 2 seats',
    ]);
    expect(screen.getByRole('button', { name: 'Table 1, Available, 2 seats' })).toHaveTextContent('2 seats');
    expect(screen.getByText('Available')).toBeInTheDocument();
    expect(screen.getByText('Occupied')).toBeInTheDocument();
    expect(screen.getByText('Reserved')).toBeInTheDocument();
    expect(screen.getByText('Cleaning')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Table 3, Reserved, 2 seats' }));
    expect(onTableClick).toHaveBeenCalledWith(tables[2]);
    fireEvent.click(screen.getByRole('button', { name: 'Table 1, Available, 2 seats' }));
    expect(onTableClick).toHaveBeenLastCalledWith(tables[0]);
  });

  it('keeps the spatial map for saved table coordinates', () => {
    const configured = [{ ...tables[0], position_x: 2, position_y: 1 }];
    const { container } = render(<FloorPlanView tables={configured} autoPresentation="availability" onTableClick={vi.fn()} />);

    expect(container.querySelector('svg g[role="button"]')).not.toBeNull();
    expect(container.querySelector('[data-table-inventory-glyph]')).toBeNull();
  });

  it('draws the recorded seat count without implying a room position', () => {
    const sixSeatTable = { ...tables[0], capacity: 6, shape: 'rectangle' } as Table;
    const { container } = render(<FloorPlanView tables={[sixSeatTable]} autoPresentation="availability" />);

    expect(container.querySelectorAll('[data-seat-marker]')).toHaveLength(6);
    expect(container.querySelector('[data-table-inventory-glyph] rect[x="8"][width="48"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Table 1, Available, 6 seats' })).toBeInTheDocument();
  });

  it('retains the existing automatic map for other callers', () => {
    const { container } = render(<FloorPlanView tables={tables} onTableClick={vi.fn()} />);

    expect(container.querySelector('svg g[role="button"]')).not.toBeNull();
  });
});
