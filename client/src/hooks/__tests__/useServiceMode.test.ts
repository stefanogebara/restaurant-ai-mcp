import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useServiceMode, isNightHour } from '../useServiceMode';

describe('isNightHour', () => {
  it('is night from 18h through 5h, day from 6h through 17h', () => {
    expect(isNightHour(18)).toBe(true);
    expect(isNightHour(23)).toBe(true);
    expect(isNightHour(0)).toBe(true);
    expect(isNightHour(5)).toBe(true);
    expect(isNightHour(6)).toBe(false);
    expect(isNightHour(12)).toBe(false);
    expect(isNightHour(17)).toBe(false);
  });
});

describe('useServiceMode', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('follows the clock by default (night at 19h)', () => {
    vi.setSystemTime(new Date(2026, 0, 15, 19, 0));
    const { result } = renderHook(() => useServiceMode());
    expect(result.current.isNight).toBe(true);
  });

  it('follows the clock by default (day at 10h)', () => {
    vi.setSystemTime(new Date(2026, 0, 15, 10, 0));
    const { result } = renderHook(() => useServiceMode());
    expect(result.current.isNight).toBe(false);
  });

  it('manual toggle overrides the clock and persists', () => {
    vi.setSystemTime(new Date(2026, 0, 15, 19, 0));
    const { result } = renderHook(() => useServiceMode());
    act(() => result.current.toggle()); // night → forced day
    expect(result.current.isNight).toBe(false);
    expect(localStorage.getItem('seatable_service_mode_override')).toBe('off');
  });

  it('toggling back to what the clock says clears the override', () => {
    vi.setSystemTime(new Date(2026, 0, 15, 19, 0));
    const { result } = renderHook(() => useServiceMode());
    act(() => result.current.toggle()); // forced day
    act(() => result.current.toggle()); // back to night = clock → override cleared
    expect(result.current.isNight).toBe(true);
    expect(localStorage.getItem('seatable_service_mode_override')).toBeNull();
  });
});
