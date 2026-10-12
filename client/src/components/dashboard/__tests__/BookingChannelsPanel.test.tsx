import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders as render } from '../../../test/renderWithProviders';
import BookingChannelsPanel from '../BookingChannelsPanel';

vi.mock('../QRCodePanel', () => ({ default: () => <div data-testid="booking-qr">QR</div> }));

describe('BookingChannelsPanel', () => {
  it('leads with one booking URL and keeps the website code optional', async () => {
    const user = userEvent.setup();
    render(<BookingChannelsPanel slug="cantina-bella" />);

    expect(screen.getByText('https://seatable.one/book/cantina-bella')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open booking page' })).toHaveAttribute(
      'href', 'https://seatable.one/book/cantina-bella',
    );
    expect(screen.getByTestId('booking-qr')).toBeVisible();

    const websiteCode = screen.getByText(/data-slug="cantina-bella"/);
    expect(websiteCode).not.toBeVisible();
    await user.click(screen.getByText('Add a booking button to your website'));
    expect(websiteCode).toBeVisible();
  });
});
