import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders as render } from '../../../test/renderWithProviders';
import Step0Search from '../Step0Search';

// We intercept `fetch` directly because Step0Search calls it with relative
// paths to /api/scrape-restaurant and /api/enrich-restaurant.
const originalFetch = global.fetch;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  global.fetch = fetchMock as unknown as typeof global.fetch;
});

afterAll(() => {
  global.fetch = originalFetch;
});

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}
function notOk(status: number, body: unknown) {
  return { ok: false, status, json: async () => body } as Response;
}

describe('Step0Search', () => {
  it('renders the search form with both inputs', () => {
    render(<Step0Search onPrefill={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByLabelText(/Restaurant name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/City/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Search Google Maps/i })).toBeDisabled();
  });

  it('enables search only when both name and city are non-empty', async () => {
    const user = userEvent.setup();
    render(<Step0Search onPrefill={vi.fn()} onSkip={vi.fn()} />);
    const cta = screen.getByRole('button', { name: /Search Google Maps/i });
    expect(cta).toBeDisabled();
    await user.type(screen.getByLabelText(/Restaurant name/i), 'Cantina Bella');
    expect(cta).toBeDisabled();
    await user.type(screen.getByLabelText(/City/i), 'São Paulo');
    expect(cta).toBeEnabled();
  });

  it('hits /api/scrape-restaurant on submit and shows the candidates list with a single card', async () => {
    fetchMock.mockResolvedValueOnce(ok({
      results: [
        {
          name: 'Cantina Bella',
          address: 'Rua das Flores 123, São Paulo',
          cuisine_type: 'Italian',
          phone: '+55 11 5555 1234',
          rating: 4.6,
          review_count: 412,
          website: 'https://cantinabella.example',
        },
      ],
    }));
    const user = userEvent.setup();
    render(<Step0Search onPrefill={vi.fn()} onSkip={vi.fn()} />);
    await user.type(screen.getByLabelText(/Restaurant name/i), 'Cantina Bella');
    await user.type(screen.getByLabelText(/City/i), 'São Paulo');
    await user.click(screen.getByRole('button', { name: /Search Google Maps/i }));

    expect(await screen.findByTestId('step0-candidates')).toBeInTheDocument();
    expect(screen.getByTestId('step0-candidate-0')).toBeInTheDocument();
    expect(screen.queryByTestId('step0-candidate-1')).toBeNull();
    expect(screen.getByText(/Rua das Flores 123, São Paulo/i)).toBeInTheDocument();
    expect(screen.getByText(/Italian/i)).toBeInTheDocument();
    expect(screen.getByText(/Found one match/i)).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith('/api/scrape-restaurant', expect.objectContaining({ method: 'POST' }));
  });

  it('renders up to 3 candidate cards when Google returns multiple matches', async () => {
    const hits = [
      { name: 'Cantina Bella', address: 'São Paulo, BR' },
      { name: 'Cantina Bella', address: 'Rio de Janeiro, BR' },
      { name: 'Cantina Bella', address: 'Lisbon, PT' },
      { name: 'Cantina Bella', address: 'Buenos Aires, AR' },  // 4th, should be sliced off
    ];
    fetchMock.mockResolvedValueOnce(ok({ results: hits }));
    const user = userEvent.setup();
    render(<Step0Search onPrefill={vi.fn()} onSkip={vi.fn()} />);
    await user.type(screen.getByLabelText(/Restaurant name/i), 'Cantina Bella');
    await user.type(screen.getByLabelText(/City/i), 'São Paulo');
    await user.click(screen.getByRole('button', { name: /Search Google Maps/i }));

    expect(await screen.findByTestId('step0-candidate-0')).toBeInTheDocument();
    expect(screen.getByTestId('step0-candidate-1')).toBeInTheDocument();
    expect(screen.getByTestId('step0-candidate-2')).toBeInTheDocument();
    expect(screen.queryByTestId('step0-candidate-3')).toBeNull();
    expect(screen.getByText(/Which one is yours\?/i)).toBeInTheDocument();
  });

  it('calls onPrefill with the picked hit (not just the top one) when user clicks "Use this one" on candidate #2', async () => {
    const hits = [
      { name: 'Cantina Bella', address: 'São Paulo, BR' },
      { name: 'Cantina Bella', address: 'Rio de Janeiro, BR' },
      { name: 'Cantina Bella', address: 'Lisbon, PT' },
    ];
    fetchMock.mockResolvedValueOnce(ok({ results: hits }));
    const onPrefill = vi.fn();
    const user = userEvent.setup();
    render(<Step0Search onPrefill={onPrefill} onSkip={vi.fn()} />);
    await user.type(screen.getByLabelText(/Restaurant name/i), 'Cantina Bella');
    await user.type(screen.getByLabelText(/City/i), 'São Paulo');
    await user.click(screen.getByRole('button', { name: /Search Google Maps/i }));
    await user.click(await screen.findByTestId('step0-pick-2'));

    expect(onPrefill).toHaveBeenCalledTimes(1);
    expect(onPrefill).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Cantina Bella',
      address: 'Lisbon, PT',
    }));
  });

  it('"None of these — got a website?" reveals the website fallback even when there are hits', async () => {
    fetchMock.mockResolvedValueOnce(ok({
      results: [{ name: 'Cantina Bella', address: 'São Paulo, BR' }],
    }));
    const user = userEvent.setup();
    render(<Step0Search onPrefill={vi.fn()} onSkip={vi.fn()} />);
    await user.type(screen.getByLabelText(/Restaurant name/i), 'Cantina Bella');
    await user.type(screen.getByLabelText(/City/i), 'São Paulo');
    await user.click(screen.getByRole('button', { name: /Search Google Maps/i }));

    expect(await screen.findByTestId('step0-candidates')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/your-restaurant\.com/i)).toBeNull();

    await user.click(screen.getByTestId('step0-none-of-these'));
    expect(screen.getByPlaceholderText(/your-restaurant\.com/i)).toBeInTheDocument();
  });

  it('shows the no-match hint + website fallback when /scrape returns 0 results', async () => {
    fetchMock.mockResolvedValueOnce(ok({ results: [] }));
    const user = userEvent.setup();
    render(<Step0Search onPrefill={vi.fn()} onSkip={vi.fn()} />);
    await user.type(screen.getByLabelText(/Restaurant name/i), 'Nonexistent Bistro');
    await user.type(screen.getByLabelText(/City/i), 'São Paulo');
    await user.click(screen.getByRole('button', { name: /Search Google Maps/i }));

    expect(await screen.findByTestId('step0-no-match')).toBeInTheDocument();
    expect(screen.getByText(/couldn't find your restaurant/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Read website/i })).toBeInTheDocument();
  });

  it('website fallback hits /api/enrich-restaurant and prefills with name + website', async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ results: [] }))           // first scrape: no hits
      .mockResolvedValueOnce(ok({ menu: null, insights: null })); // enrich-restaurant
    const onPrefill = vi.fn();
    const user = userEvent.setup();
    render(<Step0Search onPrefill={onPrefill} onSkip={vi.fn()} />);
    await user.type(screen.getByLabelText(/Restaurant name/i), 'Brand New Place');
    await user.type(screen.getByLabelText(/City/i), 'Lisbon');
    await user.click(screen.getByRole('button', { name: /Search Google Maps/i }));

    const urlInput = await screen.findByPlaceholderText(/your-restaurant\.com/i);
    await user.type(urlInput, 'https://brandnew.example');
    await user.click(screen.getByRole('button', { name: /Read website/i }));

    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/enrich-restaurant', expect.objectContaining({ method: 'POST' }));
    await waitFor(() => expect(onPrefill).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Brand New Place',
      website: 'https://brandnew.example',
    })));
  });

  it('shows an error message when /scrape returns a non-2xx', async () => {
    fetchMock.mockResolvedValueOnce(notOk(500, { error: 'Internal server error' }));
    const user = userEvent.setup();
    render(<Step0Search onPrefill={vi.fn()} onSkip={vi.fn()} />);
    await user.type(screen.getByLabelText(/Restaurant name/i), 'Whatever');
    await user.type(screen.getByLabelText(/City/i), 'X');
    await user.click(screen.getByRole('button', { name: /Search Google Maps/i }));

    expect(await screen.findByTestId('step0-search-error')).toHaveTextContent(/Internal server error/);
    expect(screen.queryByTestId('step0-top-hit')).toBeNull();
    expect(screen.queryByTestId('step0-no-match')).toBeNull();
  });

  it('skip button calls onSkip', async () => {
    const onSkip = vi.fn();
    const user = userEvent.setup();
    render(<Step0Search onPrefill={vi.fn()} onSkip={onSkip} />);
    await user.click(screen.getByTestId('step0-skip'));
    expect(onSkip).toHaveBeenCalledOnce();
  });
});
