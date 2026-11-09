import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsTabs from '../SettingsTabs';

afterEach(() => window.history.replaceState(null, '', window.location.pathname));

const voiceTabs = () => [
  { id: 'voice', label: 'Voice', content: <p>Voice preview controls</p> },
  { id: 'phone', label: 'Phone', content: <p>Phone connection</p> },
];

describe('SettingsTabs active-pane notifications', () => {
  it('reports the initial deep-linked pane once', () => {
    window.history.replaceState(null, '', '#voice-settings:phone');
    const onTabChange = vi.fn();
    render(<SettingsTabs {...{ tabs: voiceTabs(), hashKey: 'voice-settings', onTabChange }} />);
    expect(onTabChange).toHaveBeenCalledExactlyOnceWith('phone');
  });

  it('reports click, keyboard, and external hash navigation, keeping hidden panes mounted', async () => {
    const onTabChange = vi.fn();
    const user = userEvent.setup();
    render(<SettingsTabs {...{ tabs: voiceTabs(), hashKey: 'voice-settings', onTabChange }} />);
    await user.click(screen.getByRole('tab', { name: 'Phone' }));
    await user.keyboard('{ArrowLeft}');
    window.history.replaceState(null, '', '#voice-settings:phone');
    fireEvent(window, new HashChangeEvent('hashchange'));
    expect(onTabChange.mock.calls.map(([id]) => id)).toEqual(['voice', 'phone', 'voice', 'phone']);
    expect(screen.getByText('Voice preview controls')).toBeInTheDocument();
    expect(screen.getByText('Voice preview controls')).not.toBeVisible();
  });

  it('does not notify again for parent rerenders, recreated tabs, or reselecting the active tab', async () => {
    const onTabChange = vi.fn();
    const { rerender } = render(<SettingsTabs {...{ tabs: voiceTabs(), hashKey: 'voice-settings', onTabChange }} />);
    rerender(<SettingsTabs {...{ tabs: voiceTabs(), hashKey: 'voice-settings', onTabChange }} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Voice' }));
    expect(onTabChange).toHaveBeenCalledExactlyOnceWith('voice');
  });

  it('uses the latest callback without repeating notifications when its identity changes', async () => {
    const oldCallback = vi.fn();
    const latestCallback = vi.fn();
    const { rerender } = render(<SettingsTabs {...{ tabs: voiceTabs(), hashKey: 'voice-settings', onTabChange: oldCallback }} />);
    rerender(<SettingsTabs {...{ tabs: voiceTabs(), hashKey: 'voice-settings', onTabChange: latestCallback }} />);
    expect(latestCallback).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('tab', { name: 'Phone' }));
    expect(oldCallback).toHaveBeenCalledExactlyOnceWith('voice');
    expect(latestCallback).toHaveBeenCalledExactlyOnceWith('phone');
  });
});

describe('SettingsTabs lazy mounting', () => {
  it('does not fetch/render untouched panels, then preserves edits after a switch', async () => {
    const user = userEvent.setup();
    render(<SettingsTabs hashKey="integrations" lazyMount tabs={[
      { id: 'booking', label: 'Bookings', content: <p>Booking content</p> },
      { id: 'developers', label: 'Developers', content: <input aria-label="Key name" /> },
    ]} />);

    expect(screen.getByText('Booking content')).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Key name' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Developers' }));
    const input = screen.getByRole('textbox', { name: 'Key name' });
    await user.type(input, 'My POS');
    await user.click(screen.getByRole('tab', { name: 'Bookings' }));
    await user.click(screen.getByRole('tab', { name: 'Developers' }));
    expect(screen.getByRole('textbox', { name: 'Key name' })).toHaveValue('My POS');
  });

  it('mounts the requested deep-linked panel first', () => {
    window.history.replaceState(null, '', '#integrations:instagram');
    render(<SettingsTabs hashKey="integrations" lazyMount tabs={[
      { id: 'booking', label: 'Bookings', content: <p>Booking content</p> },
      { id: 'instagram', label: 'Instagram', content: <p>Instagram content</p> },
    ]} />);

    expect(screen.getByRole('tab', { name: 'Instagram' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Instagram content')).toBeVisible();
    expect(screen.queryByText('Booking content')).not.toBeInTheDocument();
  });
});
