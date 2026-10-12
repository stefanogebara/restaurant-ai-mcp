import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';

const { getDashboard, updateTablePosition } = vi.hoisted(() => ({
  getDashboard: vi.fn(),
  updateTablePosition: vi.fn(),
}));

vi.mock('../../components/layout/DashboardLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../services/api', async (orig) => {
  const actual = await orig<typeof import('../../services/api')>();
  return {
    ...actual,
    hostAPI: { ...actual.hostAPI, getDashboard, updateTablePosition },
  };
});

import FloorPlanEditor from '../FloorPlanEditor';

describe('FloorPlanEditor touch gestures', () => {
  beforeEach(() => {
    getDashboard.mockReset();
    updateTablePosition.mockReset();
    getDashboard.mockResolvedValue({ data: { tables: [{
      id: 'table-1', table_number: 1, capacity: 4, location: 'Main',
      status: 'Available', shape: 'round', is_fixed_seating: false,
      is_joinable: false, joinable_with: [], position_x: 2, position_y: 3,
      width: 1, height: 1, rotation: 0,
    }] } });
    updateTablePosition.mockResolvedValue({ data: { success: true } });

    Object.defineProperty(SVGSVGElement.prototype, 'createSVGPoint', {
      configurable: true,
      value: () => ({ x: 0, y: 0, matrixTransform() { return { x: this.x, y: this.y }; } }),
    });
    Object.defineProperty(SVGSVGElement.prototype, 'getScreenCTM', {
      configurable: true,
      value: () => ({ inverse: () => ({}) }),
    });
  });

  it('opens a table on tap without saving an unchanged position', async () => {
    const { container } = renderWithProviders(<FloorPlanEditor />);
    await screen.findByText('1');

    const table = container.querySelector('g.cursor-grab');
    expect(table).not.toBeNull();
    fireEvent.pointerDown(table!, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(table!, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.click(table!);

    expect(updateTablePosition).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Table 1' })).toBeInTheDocument();
  });

  it('still saves a deliberate table drag', async () => {
    const { container } = renderWithProviders(<FloorPlanEditor />);
    await screen.findByText('1');

    const table = container.querySelector('g.cursor-grab');
    expect(table).not.toBeNull();
    fireEvent.pointerDown(table!, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(table!, { clientX: 150, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(table!, { clientX: 150, clientY: 100, pointerId: 1 });

    await waitFor(() => expect(updateTablePosition).toHaveBeenCalledWith('table-1', 3, 3));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
