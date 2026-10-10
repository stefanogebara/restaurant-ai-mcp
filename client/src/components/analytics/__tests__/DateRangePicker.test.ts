import { createElement } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import DateRangePicker, { formatPeriodLabel, presetToRange } from '../DateRangePicker';

describe('presetToRange', () => {
  it('today: same start and end', () => {
    const { startDate, endDate } = presetToRange('today');
    expect(startDate).toBe(endDate);
  });

  it('7d: seven calendar dates including today', () => {
    const { startDate, endDate } = presetToRange('7d');
    const diff = (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000;
    expect(diff).toBe(6);
  });

  it('30d: thirty calendar dates including today', () => {
    const { startDate, endDate } = presetToRange('30d');
    const diff = (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000;
    expect(diff).toBe(29);
  });

  it('this_month: starts on day 1', () => {
    expect(presetToRange('this_month').startDate.endsWith('-01')).toBe(true);
  });

  it('last_month: start before end', () => {
    const { startDate, endDate } = presetToRange('last_month');
    expect(new Date(startDate) < new Date(endDate)).toBe(true);
  });
});

describe('formatPeriodLabel', () => {
  it('does not repeat the month and year for a same-month range', () => {
    expect(formatPeriodLabel('2026-09-01', '2026-09-30', 'pt-BR')).toMatch(/^1–30 de set\. de 2026$/);
  });

  it('keeps both months or years when a range crosses their boundary', () => {
    expect(formatPeriodLabel('2026-08-30', '2026-09-30', 'pt-BR')).toMatch(/ago\..*set\./);
    expect(formatPeriodLabel('2025-12-30', '2026-01-02', 'pt-BR')).toMatch(/2025.*2026/);
  });

  it('uses one complete date for a one-day report', () => {
    expect(formatPeriodLabel('2026-09-30', '2026-09-30', 'pt-BR')).toMatch(/^30 de set\. de 2026$/);
  });

  it('does not throw while a custom date input is temporarily blank', () => {
    expect(formatPeriodLabel('', '2026-09-30', 'pt-BR')).toBe('—');
    expect(formatPeriodLabel('2026-09-01', 'invalid', 'pt-BR')).toBe('—');
  });
});

describe('custom date inputs', () => {
  it('puts the truthful compact range on the mobile period control while keeping preset selection', () => {
    const onChange = vi.fn();
    render(createElement(DateRangePicker, {
      value: { preset: '30d', startDate: '2026-09-01', endDate: '2026-09-30' },
      onChange,
    }));

    expect(screen.getByText('1–30 Sep')).toBeInTheDocument();
    const period = screen.getByRole('combobox', { name: 'Selected period' });
    expect(period.getAttribute('title')).toContain('2026');
    fireEvent.change(period, { target: { value: '90d' } });
    expect(onChange).toHaveBeenCalledWith({ preset: '90d', ...presetToRange('90d') });
  });

  it('keeps both months visible in the compact control when a range crosses a month', () => {
    render(createElement(DateRangePicker, {
      value: { preset: '30d', startDate: '2026-09-06', endDate: '2026-10-05' },
      onChange: vi.fn(),
    }));

    expect(screen.getByText('6 Sep – 5 Oct')).toBeInTheDocument();
  });

  it('keeps less-used periods available in the compact desktop control', () => {
    const onChange = vi.fn();
    render(createElement(DateRangePicker, {
      value: { preset: '30d', startDate: '2026-09-01', endDate: '2026-09-30' },
      onChange,
    }));

    fireEvent.change(screen.getByRole('combobox', { name: 'Other periods' }), { target: { value: 'this_month' } });
    expect(onChange).toHaveBeenCalledWith({ preset: 'this_month', ...presetToRange('this_month') });
  });

  it('keeps the applied range valid when a browser emits an empty date during editing', () => {
    const onChange = vi.fn();
    render(createElement(DateRangePicker, {
      value: { preset: 'custom', startDate: '2026-09-01', endDate: '2026-09-30' },
      onChange,
    }));

    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '' } });
    expect(onChange).not.toHaveBeenCalled();
  });
});
