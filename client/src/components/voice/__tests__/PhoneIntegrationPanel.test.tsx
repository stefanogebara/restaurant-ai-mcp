import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../../hooks/usePhoneIntegration', () => ({ usePhoneIntegration: vi.fn() }));
vi.mock('../../../contexts/ToastContext', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }) }));

import { usePhoneIntegration } from '../../../hooks/usePhoneIntegration';
import PhoneIntegrationPanel from '../PhoneIntegrationPanel';

const mockUsePhoneIntegration = usePhoneIntegration as ReturnType<typeof vi.fn>;

function basePhoneState() {
  return {
    isLoading: false,
    isError: false,
    isMutating: false,
    isRegistering: false,
    isUnregistering: false,
    isTestingCall: false,
    register: vi.fn(),
    unregister: vi.fn(),
    sendTestCall: vi.fn(),
    testNumber: '',
    setTestNumber: vi.fn(),
    status: {
      success: true,
      restaurant: { name: 'Casa Tuim', has_agent: true, agent_id: 'agent-1', phone_number: null as string | null, status: 'not_configured', error: null, configured_at: null },
      platform: { twilio_phone: null, line_availability: 'available' },
    },
  };
}

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  render(<QueryClientProvider client={queryClient}><PhoneIntegrationPanel /></QueryClientProvider>);
  return { invalidate };
}

describe('PhoneIntegrationPanel', () => {
  beforeEach(() => {
    mockUsePhoneIntegration.mockReturnValue(basePhoneState());
  });

  it('does not present an unconnected platform line as the restaurant number', () => {
    renderPanel();
    expect(screen.getByText('Line assigned to your restaurant')).toBeInTheDocument();
    expect(screen.getByText(/setup requires support/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /register agent|connect/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /test call/i })).not.toBeInTheDocument();
  });

  it('presents an active backend record as registration awaiting a call test', () => {
    const previous = basePhoneState();
    mockUsePhoneIntegration.mockReturnValue({ ...previous, status: { ...previous.status, restaurant: { ...previous.status.restaurant, status: 'active', phone_number: '+551140001234' }, platform: { twilio_phone: '+551140001234', line_availability: 'owned_by_this_restaurant' } } });
    renderPanel();
    expect(screen.getByText('Line assigned to your restaurant')).toBeInTheDocument();
    expect(screen.getByText('Registered · test pending')).toBeInTheDocument();
    expect(screen.queryByText('Active')).not.toBeInTheDocument();
    expect(screen.queryByText('Connected line')).not.toBeInTheDocument();
    expect(screen.getByText('+55 11 4000-1234')).toBeInTheDocument();
    expect(screen.getByText(/inbound routing is not verified/i)).toBeInTheDocument();
    expect(screen.getByText(/this page does not place a call/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Call this line' })).toHaveAttribute('href', 'tel:+551140001234');
    expect(screen.queryByRole('button', { name: /test call/i })).not.toBeInTheDocument();
  });

  it('masks a line assigned to another restaurant and offers no self-service connection', () => {
    const previous = basePhoneState();
    mockUsePhoneIntegration.mockReturnValue({ ...previous, status: { ...previous.status, restaurant: { ...previous.status.restaurant, status: 'unavailable' }, platform: { twilio_phone: null, line_availability: 'unavailable' } } });
    renderPanel();
    expect(screen.getByText(/already in use/i)).toBeInTheDocument();
    expect(screen.queryByText('+55 11 5028-9356')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /register agent|connect|test call/i })).not.toBeInTheDocument();
  });

  it('shows an actionable error instead of silently disappearing when status fails', () => {
    const previous = basePhoneState();
    mockUsePhoneIntegration.mockReturnValue({ ...previous, status: undefined, isError: true });
    const { invalidate } = renderPanel();
    expect(screen.getByRole('alert')).toHaveTextContent('Phone status is unavailable');
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['phone-integration-status'] });
  });
});
