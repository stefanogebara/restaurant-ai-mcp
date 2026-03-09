import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ManagerNotificationsPanel from '../ManagerNotificationsPanel';

// Mock hooks
const mockMutate = vi.fn();

vi.mock('../../../hooks/useManagerPreferences', () => ({
  useManagerPreferences: vi.fn(),
  useSaveManagerPreferences: vi.fn(),
}));

vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

import {
  useManagerPreferences,
  useSaveManagerPreferences,
} from '../../../hooks/useManagerPreferences';

const mockUsePrefs = vi.mocked(useManagerPreferences);
const mockUseSave = vi.mocked(useSaveManagerPreferences);

function setupMocks(prefs = {}, isPending = false) {
  mockUsePrefs.mockReturnValue({ data: prefs, isLoading: false } as ReturnType<typeof useManagerPreferences>);
  mockUseSave.mockReturnValue({ mutate: mockMutate, isPending } as unknown as ReturnType<typeof useSaveManagerPreferences>);
}

describe('ManagerNotificationsPanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders null while loading', () => {
    mockUsePrefs.mockReturnValue({ data: undefined, isLoading: true } as ReturnType<typeof useManagerPreferences>);
    mockUseSave.mockReturnValue({ mutate: mockMutate, isPending: false } as unknown as ReturnType<typeof useSaveManagerPreferences>);
    const { container } = render(<ManagerNotificationsPanel />);
    expect(container.firstChild).toBeNull();
  });

  it('renders briefing channel radio buttons', () => {
    setupMocks({});
    render(<ManagerNotificationsPanel />);
    expect(screen.getByRole('radio', { name: 'Text Message' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Voice Note' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Phone Call' })).toBeInTheDocument();
  });

  it('defaults to text channel when no preference saved', () => {
    setupMocks({});
    render(<ManagerNotificationsPanel />);
    expect(screen.getByRole('radio', { name: 'Text Message' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Voice Note' })).not.toBeChecked();
  });

  it('reflects saved briefing_channel preference', () => {
    setupMocks({ briefing_channel: 'voice_note' });
    render(<ManagerNotificationsPanel />);
    expect(screen.getByRole('radio', { name: 'Voice Note' })).toBeChecked();
  });

  it('renders all three alert checkboxes', () => {
    setupMocks({});
    render(<ManagerNotificationsPanel />);
    expect(screen.getByRole('checkbox', { name: 'Low covers' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'High no-show risk' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Late cancellations' })).toBeInTheDocument();
  });

  it('Save button is disabled when no changes made', () => {
    setupMocks({ briefing_channel: 'text', alert_low_covers: false });
    render(<ManagerNotificationsPanel />);
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('Save button is enabled after changing a radio option', async () => {
    const user = userEvent.setup();
    setupMocks({ briefing_channel: 'text' });
    render(<ManagerNotificationsPanel />);

    await user.click(screen.getByRole('radio', { name: 'Voice Note' }));
    expect(screen.getByRole('button', { name: /save/i })).not.toBeDisabled();
  });

  it('Save button is enabled after toggling a checkbox', async () => {
    const user = userEvent.setup();
    setupMocks({ alert_low_covers: false });
    render(<ManagerNotificationsPanel />);

    await user.click(screen.getByRole('checkbox', { name: 'Low covers' }));
    expect(screen.getByRole('button', { name: /save/i })).not.toBeDisabled();
  });

  it('calls mutate with pending changes when Save is clicked', async () => {
    const user = userEvent.setup();
    setupMocks({ briefing_channel: 'text', alert_high_noshows: false });
    render(<ManagerNotificationsPanel />);

    await user.click(screen.getByRole('radio', { name: 'Phone Call' }));
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(mockMutate).toHaveBeenCalledWith(
      { briefing_channel: 'phone_call' },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) })
    );
  });

  it('shows "Saving…" text while mutation is pending', () => {
    setupMocks({}, true);
    render(<ManagerNotificationsPanel />);
    expect(screen.getByRole('button', { name: /loading/i })).toBeInTheDocument();
  });
});
