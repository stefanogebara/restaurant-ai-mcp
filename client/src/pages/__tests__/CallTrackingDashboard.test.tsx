import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import CallTrackingDashboard from '../CallTrackingDashboard';

const refetchConversations = vi.fn();
const refetchStats = vi.fn();
const refetchPhoneStatus = vi.fn();

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { user_metadata: { restaurant_id: 'owned' } } }) }));
vi.mock('../../components/layout/DashboardLayout', () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('../../components/call-tracking/CallPhoneStatusCard', () => ({ default: () => <div>phone status</div> }));
vi.mock('../../hooks/useCallTracking', () => ({
  CALLS_PAGE_SIZE: 50,
  useCallConversations: () => ({
    data: { conversations: [], pagination: { total: 0, limit: 50, offset: 0, has_more: false } },
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: refetchConversations,
  }),
  useCallStats: () => ({ data: null, isError: false, refetch: refetchStats }),
  usePhoneStatus: () => ({ data: null, isLoading: false, isError: false, refetch: refetchPhoneStatus }),
  useConversationDetail: () => ({ data: null }),
}));

describe('CallTrackingDashboard', () => {
  it('refreshes the list, period statistics and phone status together', () => {
    refetchConversations.mockClear();
    refetchStats.mockClear();
    refetchPhoneStatus.mockClear();
    renderWithProviders(<CallTrackingDashboard />);
    fireEvent.click(screen.getByRole('button', { name: /^(refresh|atualizar|actualizar)$/i }));
    expect(refetchConversations).toHaveBeenCalledOnce();
    expect(refetchStats).toHaveBeenCalledOnce();
    expect(refetchPhoneStatus).toHaveBeenCalledOnce();
  });
});
