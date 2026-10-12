import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from 'i18next';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../../test/renderWithProviders';
import ProactiveCommsPanel from '../ProactiveCommsPanel';
import type { ProactiveCommItem } from '../../../hooks/useProactiveComms';

const mockList = vi.fn();
vi.mock('../../../hooks/useProactiveComms', () => ({
  useProactiveComms: () => mockList(),
  useUpdateProactiveComm: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSendProactiveComm: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const oldRow = {
  id: 'old-queue-row', type: 'churn_risk', status: 'pending',
  customer_name: 'Test Guest', customer_phone: '+15550000000',
  suggested_action: 'at-risk guest at 100% churn risk — 7 visits',
  trigger_data: { churn_risk: 100, total_visits: 7, last_visit: '2026-04-12' },
  draft_message: 'Hello', restaurant_id: 'restaurant-1', customer_id: 'customer-1',
  approved_by: null, approved_at: null, sent_at: null, send_error: null,
  expires_at: '2026-10-20T00:00:00Z', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
} satisfies ProactiveCommItem;

beforeEach(() => {
  mockList.mockReturnValue({ data: { items: [oldRow, { ...oldRow, id: 'second' }] }, isLoading: false });
});
afterEach(async () => { await i18n.changeLanguage('en'); });

describe('ProactiveCommsPanel', () => {
  it.each([
    ['en', 'Drift score 100/100', '2 pending'],
    ['pt-BR', 'Pontuação de afastamento 100/100', '2 pendentes'],
    ['es', 'Puntuación de abandono 100/100', '2 pendientes'],
  ])('renders old queue rows honestly in %s', async (language, score, count) => {
    await i18n.changeLanguage(language);
    renderWithProviders(<ProactiveCommsPanel />);
    expect(screen.getAllByText(new RegExp(score)).length).toBe(2);
    expect(screen.getByText(count)).toBeInTheDocument();
    expect(screen.queryByText(/100%.*(churn|risco|fuga)/i)).not.toBeInTheDocument();
  });

  it('does not invent a zero score when structured risk is absent', () => {
    mockList.mockReturnValue({ data: { items: [{ ...oldRow, trigger_data: {} }] }, isLoading: false });
    renderWithProviders(<ProactiveCommsPanel />);
    expect(screen.getByText('Drift score unavailable')).toBeInTheDocument();
    expect(screen.queryByText(/0\/100/)).not.toBeInTheDocument();
  });
});
