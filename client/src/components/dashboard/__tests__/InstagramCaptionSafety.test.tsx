import { expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import InstagramCaptionDrafter from '../InstagramCaptionDrafter';

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock('../../../services/api', () => ({ authFetch: fetchMock }));
vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

it('does not attach old images to a newly generated caption at the same index', async () => {
  let generation = 0;
  fetchMock.mockReset().mockImplementation(async (url: string) => {
    if (url === '/api/instagram/draft-caption') {
      generation += 1;
      return { ok: true, json: async () => ({ ok: true, drafts: generation === 1
        ? ['First caption', 'First alternative', 'Third alternative']
        : ['New caption', 'New alternative', 'Another new caption'] }) };
    }
    return { ok: true, json: async () => ({ ok: true, month: { total_cents: 0 } }) };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><InstagramCaptionDrafter toneProfileReady /></QueryClientProvider>);
  const user = userEvent.setup();

  await user.type(screen.getByLabelText("What's the post about?"), 'Tonight’s special');
  await user.click(screen.getByRole('button', { name: 'Draft 3 captions' }));
  const firstCard = await screen.findByTestId('instagram-caption-drafter-card-0');
  expect(within(firstCard).getByText('First caption')).toBeInTheDocument();
  await user.click(within(firstCard).getByRole('button', { name: 'Post to Instagram' }));
  await user.type(within(firstCard).getByPlaceholderText('https://your-cdn.com/photo.jpg'), 'https://example.com/old.jpg');
  await user.click(within(firstCard).getByRole('button', { name: 'Add' }));
  expect(within(firstCard).getByTestId('instagram-caption-drafter-thumb-0-0')).toBeInTheDocument();

  const secondCard = screen.getByTestId('instagram-caption-drafter-card-1');
  await user.click(within(secondCard).getByRole('button', { name: 'Post to Instagram' }));
  expect(within(firstCard).queryByTestId('instagram-caption-drafter-post-form-0')).not.toBeInTheDocument();
  await user.click(within(firstCard).getByRole('button', { name: 'Post to Instagram' }));
  expect(within(firstCard).getByTestId('instagram-caption-drafter-thumb-0-0')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Draft 3 captions' }));
  const newCard = await screen.findByTestId('instagram-caption-drafter-card-0');
  expect(within(newCard).getByText('New caption')).toBeInTheDocument();
  await user.click(within(newCard).getByRole('button', { name: 'Post to Instagram' }));
  expect(within(newCard).queryByTestId('instagram-caption-drafter-thumb-0-0')).not.toBeInTheDocument();
  expect(within(newCard).getByRole('button', { name: 'Post now' })).toBeDisabled();
});
