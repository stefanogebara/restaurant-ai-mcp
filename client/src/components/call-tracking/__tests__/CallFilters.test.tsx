import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
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


describe('Call filter search synchronization', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('accepts an external reset without restoring the old search on the next edit', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const initial: CallFilter = { period: '7d', outcome: 'all', language: 'all', search: 'Stefano' };
    const { rerender } = render(<CallFilters filter={initial} onChange={onChange} />);
    rerender(<CallFilters filter={{ ...initial, search: undefined }} onChange={onChange} />);
    expect(screen.getByRole('textbox', { name: 'Search calls...' })).toHaveValue('');
    act(() => { vi.advanceTimersByTime(300); });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('cancels pending text when the parent replaces the active search', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const initial: CallFilter = { period: '7d', outcome: 'all', language: 'all', search: 'Old' };
    const { rerender } = render(<CallFilters filter={initial} onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Search calls...' }), { target: { value: 'Pending' } });
    rerender(<CallFilters filter={{ ...initial, search: 'Replacement' }} onChange={onChange} />);
    act(() => { vi.advanceTimersByTime(300); });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Search calls...' })).toHaveValue('Replacement');
  });

  it('merges a pending search into the newest period and outcome', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const initial: CallFilter = { period: '7d', outcome: 'all', language: 'all' };
    const { rerender } = render(<CallFilters filter={initial} onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Search calls...' }), { target: { value: 'Guest' } });
    rerender(<CallFilters filter={{ ...initial, period: '30d', outcome: 'error' }} onChange={onChange} />);
    act(() => { vi.advanceTimersByTime(300); });
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...initial, period: '30d', outcome: 'error', search: 'Guest' });
  });
});


it('clears advanced filters and pending search together, while retaining the selected period', () => {
  vi.useFakeTimers();
  const onChange = vi.fn();
  const initial: CallFilter = { period: '30d', outcome: 'error', language: 'pt', sentiment: 'negative', search: 'Old' };
  const { rerender } = render(<CallFilters filter={initial} onChange={onChange} />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Search calls...' }), { target: { value: 'Pending' } });
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  const reset = { period: '30d', outcome: 'all', language: 'all', sentiment: undefined, search: undefined } as CallFilter;
  expect(onChange).toHaveBeenCalledExactlyOnceWith(reset);
  rerender(<CallFilters filter={reset} onChange={onChange} />);
  act(() => { vi.advanceTimersByTime(300); });
  expect(onChange).toHaveBeenCalledOnce();
  expect(screen.getByRole('textbox', { name: 'Search calls...' })).toHaveValue('');
  vi.useRealTimers();
});
