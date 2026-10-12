import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsTabs from '../SettingsTabs';

afterEach(() => window.history.replaceState(null, '', window.location.pathname));

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
