import { renderHook } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Single hoisted mock — value is controlled per-describe via beforeEach
let mockRole: string | null = 'host';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ role: mockRole }),
}));

import { usePermission } from '../usePermission';

describe('usePermission — host role', () => {
  beforeEach(() => { mockRole = 'host'; });

  it('can manageReservations', () => {
    const { result } = renderHook(() => usePermission());
    expect(result.current.can('manageReservations')).toBe(true);
  });

  it('can manageTables', () => {
    const { result } = renderHook(() => usePermission());
    expect(result.current.can('manageTables')).toBe(true);
  });

  it('cannot manageTeam', () => {
    const { result } = renderHook(() => usePermission());
    expect(result.current.can('manageTeam')).toBe(false);
  });

  it('cannot viewAnalytics', () => {
    const { result } = renderHook(() => usePermission());
    expect(result.current.can('viewAnalytics')).toBe(false);
  });

  it('cannot manageSubscription', () => {
    const { result } = renderHook(() => usePermission());
    expect(result.current.can('manageSubscription')).toBe(false);
  });
});

describe('usePermission — owner role', () => {
  beforeEach(() => { mockRole = 'owner'; });

  it('can do everything', () => {
    const { result } = renderHook(() => usePermission());
    expect(result.current.can('manageTeam')).toBe(true);
    expect(result.current.can('manageSubscription')).toBe(true);
    expect(result.current.can('viewAnalytics')).toBe(true);
  });
});

describe('usePermission — null role', () => {
  beforeEach(() => { mockRole = null; });

  it('cannot do anything', () => {
    const { result } = renderHook(() => usePermission());
    expect(result.current.can('viewDashboard')).toBe(false);
    expect(result.current.can('manageReservations')).toBe(false);
  });
});

describe('usePermission — manager role', () => {
  beforeEach(() => { mockRole = 'manager'; });

  it('can viewAnalytics', () => {
    const { result } = renderHook(() => usePermission());
    expect(result.current.can('viewAnalytics')).toBe(true);
  });

  it('cannot manageTeam', () => {
    const { result } = renderHook(() => usePermission());
    expect(result.current.can('manageTeam')).toBe(false);
  });
});
