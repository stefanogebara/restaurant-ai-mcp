import { describe, test, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import ManagerAIUsageBar from '../ManagerAIUsageBar';

vi.mock('../../../services/api', () => ({
  api: { get: vi.fn() }
}));

import { api } from '../../../services/api';
const mockGet = vi.mocked(api.get);

function wrap(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {ui}
    </QueryClientProvider>
  );
}

describe('ManagerAIUsageBar', () => {
  beforeEach(() => vi.clearAllMocks());

  test('renders nothing while loading', () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    const { container } = wrap(<ManagerAIUsageBar />);
    expect(container.firstChild).toBeNull();
  });

  test('renders usage count for starter plan', async () => {
    mockGet.mockResolvedValue({ data: { used: 47, limit: 100, plan: 'starter', resets_at: '2026-04-01' } });
    wrap(<ManagerAIUsageBar />);
    expect(await screen.findByText(/47 \/ 100/)).toBeInTheDocument();
  });

  test('shows upgrade CTA when usage >= 80% of limit', async () => {
    mockGet.mockResolvedValue({ data: { used: 82, limit: 100, plan: 'starter', resets_at: '2026-04-01' } });
    wrap(<ManagerAIUsageBar />);
    expect(await screen.findByText(/Running low/i)).toBeInTheDocument();
  });

  test('shows Unlimited for scale plan', async () => {
    mockGet.mockResolvedValue({ data: { used: 12, limit: null, plan: 'scale', resets_at: '2026-04-01' } });
    wrap(<ManagerAIUsageBar />);
    expect(await screen.findByText(/Unlimited/i)).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  test('shows upgrade CTA at limit (100/100)', async () => {
    mockGet.mockResolvedValue({ data: { used: 100, limit: 100, plan: 'starter', resets_at: '2026-04-01' } });
    wrap(<ManagerAIUsageBar />);
    expect(await screen.findByText(/Upgrade/i)).toBeInTheDocument();
  });
});
