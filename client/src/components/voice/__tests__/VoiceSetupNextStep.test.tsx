import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../../hooks/usePhoneIntegration', () => ({ usePhoneIntegration: vi.fn() }));

import { usePhoneIntegration } from '../../../hooks/usePhoneIntegration';
import VoiceSetupNextStep from '../VoiceSetupNextStep';

const phone = usePhoneIntegration as ReturnType<typeof vi.fn>;

const status = {
  restaurant: { status: 'active', phone_number: '+551140001234', has_agent: true },
  platform: { line_availability: 'owned_by_this_restaurant' },
};

describe('VoiceSetupNextStep', () => {
  beforeEach(() => phone.mockReset());

  it('asks for a real call only when the restaurant owns the assigned line', () => {
    phone.mockReturnValue({ status, isLoading: false, isError: false });
    render(<VoiceSetupNextStep />);
    expect(screen.getByRole('heading', { name: 'Test the first real call.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /See number and test steps/i })).toHaveAttribute('href', '#voice-settings:phone');
  });

  it('directs an unassigned restaurant to assisted setup', () => {
    phone.mockReturnValue({ status: { restaurant: { status: 'not_configured', phone_number: null }, platform: { line_availability: 'available' } }, isLoading: false, isError: false });
    render(<VoiceSetupNextStep />);
    expect(screen.getByRole('heading', { name: 'Ask us to set up your line.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /See setup steps/i })).toHaveAttribute('href', '#voice-settings:phone');
  });

  it('does not imply a line is ready when ownership cannot be checked', () => {
    phone.mockReturnValue({ status: { restaurant: { status: 'active' } }, isLoading: false, isError: false });
    render(<VoiceSetupNextStep />);
    expect(screen.getByRole('heading', { name: 'Check the line before forwarding calls.' })).toBeInTheDocument();
    expect(screen.queryByText('Test the first real call.')).not.toBeInTheDocument();
  });
});
