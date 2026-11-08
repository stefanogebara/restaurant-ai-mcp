import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import CallFilters from '../CallFilters';
import type { CallFilter } from '../callTrackingTypes';

function FilterHarness() {
  const [filter, setFilter] = useState<CallFilter>({ period: '7d', outcome: 'all', language: 'all' });
  return <CallFilters filter={filter} onChange={setFilter} />;
}

describe('CallFilters', () => {
  it('keeps a selected advanced filter after the mobile controls are collapsed', () => {
    render(<FilterHarness />);
    const more = screen.getByRole('button', { name: 'More filters' });
    expect(more).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(more);
    fireEvent.change(screen.getByRole('combobox', { name: 'Outcome' }), { target: { value: 'error' } });
    expect(screen.getByRole('button', { name: 'More filters (1)' })).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'More filters (1)' }));
    expect(screen.getByRole('button', { name: 'More filters (1)' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('combobox', { name: 'Outcome' })).toHaveValue('error');
  });
});
