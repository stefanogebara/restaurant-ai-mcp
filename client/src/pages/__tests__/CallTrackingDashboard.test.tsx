import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import CallTrackingDashboard from '../CallTrackingDashboard';

const refetchConversations = vi.fn();
const refetchStats = vi.fn();
const refetchPhoneStatus = vi.fn();
const observedChannels = vi.hoisted(() => [] as string[]);
const detailState = vi.hoisted(() => ({ data: null as unknown, isPending: false, isError: false, isFetching: false, refetch: vi.fn() }));
const call = {
  id: 'call-a', conversation_id: 'provider-a', caller_phone: '+5511999888777', called_phone: '+551150289356',
  started_at: '2026-11-09T13:00:32Z', ended_at: '2026-11-09T13:01:36Z',
  duration_seconds: 64, language: 'pt', outcome: 'information_only', transcript: [], customer_name: 'Beatriz Costa',
};
const listState = vi.hoisted(() => ({ populated: false, total: 0, fetching: false }));
const observedPages = vi.hoisted(() => [] as number[]);
const phoneState = vi.hoisted(() => ({ enabled: false, shared: false }));

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { user_metadata: { restaurant_id: 'owned' } } }) }));
vi.mock('../../components/layout/DashboardLayout', () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('../../components/call-tracking/CallPhoneStatusCard', () => ({ default: () => <div>phone status</div> }));
vi.mock('../../hooks/useCallTracking', () => ({
  CALLS_PAGE_SIZE: 50,
  useCallConversations: (_filter: unknown, _userId: unknown, page: number, channel: string) => {
    observedChannels.push(channel);
    observedPages.push(page);
    return ({
    data: { conversations: listState.populated && (page === 0 || page * 50 < listState.total) ? [call] : [], pagination: { total: listState.total, limit: 50, offset: page * 50, has_more: (page + 1) * 50 < listState.total } },
    isLoading: false,
    isError: false,
    isFetching: listState.fetching,
    refetch: refetchConversations,
  }); },
  useCallStats: () => ({ data: null, isError: false, refetch: refetchStats }),
  usePhoneStatus: () => ({ data: phoneState.enabled ? {
    name: 'Sandbox', has_agent: false, agent_id: null, phone_number: null, phone_number_id: null,
    status: 'not_configured', shared_routing_enabled: phoneState.shared, error: null, configured_at: null,
  } : null, isLoading: false, isError: false, refetch: refetchPhoneStatus }),
  useConversationDetail: () => detailState,
}));

beforeEach(() => {
  phoneState.enabled = false;
  phoneState.shared = false;
  listState.populated = false;
  listState.total = 0;
  listState.fetching = false;
  observedPages.length = 0;
  detailState.data = null;
  detailState.isPending = false;
  detailState.isError = false;
  detailState.isFetching = false;
  detailState.refetch.mockReset();
});

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

  it('keeps conversations without phone evidence outside call metrics', () => {
    observedChannels.length = 0;
    renderWithProviders(<CallTrackingDashboard />);
    expect(observedChannels.at(-1)).toBe('phone');
    fireEvent.click(screen.getByRole('button', { name: 'Other conversations' }));
    expect(observedChannels.at(-1)).toBe('unclassified');
    expect(screen.getByText(/excluded from phone call metrics/i)).toBeVisible();
  });
});


it('shows a closable loading dialog as soon as a call is opened', () => {
  listState.populated = true;
  detailState.isPending = true;
  detailState.isFetching = true;
  renderWithProviders(<CallTrackingDashboard />);
  fireEvent.click(screen.getByRole('button', { name: /open call.*Beatriz Costa/i }));
  expect(screen.getByRole('dialog', { name: 'Conversation Details' })).toHaveFocus();
  expect(screen.getByRole('status')).toHaveTextContent('Loading call details…');
  fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('shows a retryable call-detail error and recovers without resetting the dialog focus', () => {
  listState.populated = true;
  detailState.isError = true;
  const { rerender } = renderWithProviders(<CallTrackingDashboard />);
  const opener = screen.getByRole('button', { name: /open call.*Beatriz Costa/i });
  opener.focus();
  fireEvent.click(opener);
  expect(screen.getByRole('alert')).toHaveTextContent("We couldn't load this call. Try again.");
  const close = screen.getAllByRole('button', { name: 'Close' })[0];
  close.focus();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(detailState.refetch).toHaveBeenCalledOnce();
  detailState.data = { ...call, summary: 'The guest asked about opening hours.' };
  detailState.isError = false;
  rerender(<CallTrackingDashboard />);
  expect(screen.getByText('The guest asked about opening hours.')).toBeVisible();
  expect(close).toHaveFocus();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(opener).toHaveFocus();
});

it('explains an unavailable detail rather than leaving the click unanswered', () => {
  listState.populated = true;
  renderWithProviders(<CallTrackingDashboard />);
  fireEvent.click(screen.getByRole('button', { name: /open call.*Beatriz Costa/i }));
  expect(screen.getByRole('alert')).toHaveTextContent('This call is no longer available.');
  expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
});


it('recovers the last valid page when polling removes the current final page', () => {
  listState.populated = true;
  listState.total = 75;
  const { rerender } = renderWithProviders(<CallTrackingDashboard />);
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(observedPages.at(-1)).toBe(1);
  listState.total = 40;
  rerender(<CallTrackingDashboard />);
  expect(observedPages.at(-1)).toBe(0);
  expect(screen.getByRole('button', { name: /open call.*Beatriz Costa/i })).toBeVisible();
});

it('retains loaded call details when a background refresh fails', () => {
  listState.populated = true;
  detailState.data = { ...call, summary: 'Recorded summary' };
  detailState.isError = true;
  renderWithProviders(<CallTrackingDashboard />);
  fireEvent.click(screen.getByRole('button', { name: /open call.*Beatriz Costa/i }));
  expect(screen.getByText('Recorded summary')).toBeVisible();
  expect(screen.getByRole('alert')).toHaveTextContent("We couldn't update these call details. The last loaded version is shown.");
  expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
});


it('waits for the current page request to settle before clamping pagination', () => {
  listState.populated = true;
  listState.total = 75;
  const { rerender } = renderWithProviders(<CallTrackingDashboard />);
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  listState.total = 40;
  listState.fetching = true;
  rerender(<CallTrackingDashboard />);
  expect(observedPages.at(-1)).toBe(1);
  listState.fetching = false;
  rerender(<CallTrackingDashboard />);
  expect(observedPages.at(-1)).toBe(0);
});

it('resets pagination when the period or conversation channel changes', () => {
  listState.populated = true;
  listState.total = 75;
  renderWithProviders(<CallTrackingDashboard />);
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(observedPages.at(-1)).toBe(1);
  fireEvent.click(screen.getByRole('button', { name: '30 days' }));
  expect(observedPages.at(-1)).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.click(screen.getByRole('button', { name: 'Other conversations' }));
  expect(observedPages.at(-1)).toBe(0);
  expect(observedChannels.at(-1)).toBe('unclassified');
});


it('does not explain an empty shared-call history as an unassigned phone line', () => {
  phoneState.enabled = true;
  phoneState.shared = true;
  renderWithProviders(<CallTrackingDashboard />);
  expect(screen.getByText('No calls match these filters')).toBeVisible();
  expect(screen.queryByText(/This restaurant has no assigned phone line/)).not.toBeInTheDocument();
});
