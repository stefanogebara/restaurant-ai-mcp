import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../../hooks/useVoiceExperiment', () => ({
  useVoiceExperiment: vi.fn(),
  useCreateExperiment: vi.fn(),
  usePromoteExperiment: vi.fn(),
  useRollbackExperiment: vi.fn(),
}));

import {
  useVoiceExperiment,
  useCreateExperiment,
  usePromoteExperiment,
  useRollbackExperiment,
} from '../../../hooks/useVoiceExperiment';
import VoiceExperimentPanel from '../VoiceExperimentPanel';

const mockUseVoiceExperiment = useVoiceExperiment as ReturnType<typeof vi.fn>;
const mockUseCreate = useCreateExperiment as ReturnType<typeof vi.fn>;
const mockUsePromote = usePromoteExperiment as ReturnType<typeof vi.fn>;
const mockUseRollback = useRollbackExperiment as ReturnType<typeof vi.fn>;

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

describe('VoiceExperimentPanel', () => {
  beforeEach(() => {
    mockUseCreate.mockReturnValue({ mutate: vi.fn(), isPending: false });
    mockUsePromote.mockReturnValue({ mutate: vi.fn(), isPending: false });
    mockUseRollback.mockReturnValue({ mutate: vi.fn(), isPending: false });
  });

  // -----------------------------------------------------------------------
  // 1. No experiment state
  // -----------------------------------------------------------------------

  it('renders "A/B Test Your Voice" title and Create Experiment button when no experiment', () => {
    mockUseVoiceExperiment.mockReturnValue({ data: null, isLoading: false });
    renderWithClient(<VoiceExperimentPanel />);

    expect(screen.getByText('A/B Test Your Voice')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create experiment/i })).toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // 2. Running experiment
  // -----------------------------------------------------------------------

  it('renders experiment name, traffic split, counts, Promote and Roll Back buttons when running', () => {
    mockUseVoiceExperiment.mockReturnValue({
      data: {
        id: 'exp-1',
        status: 'running',
        branch_id: 'branch-xyz',
        branch_name: 'Friendly Voice',
        variant_config: { agent_name: 'Marco' },
        traffic_split: 20,
        control_count: 15,
        variant_count: 8,
        started_at: '2026-03-16T00:00:00Z',
        completed_at: null,
        result: null,
        created_at: '2026-03-16T00:00:00Z',
      },
      isLoading: false,
    });

    renderWithClient(<VoiceExperimentPanel />);

    expect(screen.getByText('Friendly Voice')).toBeInTheDocument();
    expect(screen.getByText('Traffic split: 20% variant')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('Control')).toBeInTheDocument();
    expect(screen.getByText('Variant')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /promote/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /roll back/i })).toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // 3. Completed experiment
  // -----------------------------------------------------------------------

  it('renders result summary and Start New Experiment button when completed', () => {
    mockUseVoiceExperiment.mockReturnValue({
      data: {
        id: 'exp-2',
        status: 'completed',
        branch_id: null,
        branch_name: 'Speed Test',
        variant_config: { speed: 1.2 },
        traffic_split: 10,
        control_count: null,
        variant_count: null,
        started_at: '2026-03-14T00:00:00Z',
        completed_at: '2026-03-16T00:00:00Z',
        result: { winner: 'control' },
        created_at: '2026-03-14T00:00:00Z',
      },
      isLoading: false,
    });

    renderWithClient(<VoiceExperimentPanel />);

    expect(screen.getByText('A/B Test Result')).toBeInTheDocument();
    expect(screen.getByText(/Speed Test/)).toBeInTheDocument();
    expect(screen.getByText('Control')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start new experiment/i })).toBeInTheDocument();
  });
});
