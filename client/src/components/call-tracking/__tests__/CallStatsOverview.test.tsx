import { afterEach, describe, expect, it } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import i18n from 'i18next';
import type { Stats } from '../callTrackingTypes';
import CallStatsOverview from '../CallStatsOverview';

function stats(total: number, booked: number): Stats {
  return {
    overview: {
      total_calls: total,
      successful_bookings: booked,
      success_rate: total > 0 ? booked / total * 100 : 0,
      completed_calls: total > 0 ? total - 1 : 0,
      completion_rate: total > 0 ? Math.round(((total - 1) / total) * 1000) / 10 : 0,
      average_duration_seconds: total > 0 ? 60 : 0,
      average_duration_formatted: total > 0 ? '1m' : '0s',
    },
    breakdowns: { by_outcome: {}, by_language: {}, by_day: {} },
    top_errors: [],
  };
}

afterEach(async () => { await act(async () => { await i18n.changeLanguage('en'); }); });

describe('CallStatsOverview', () => {
  it('does not claim a 0% success rate when there were no calls', () => {
    render(<CallStatsOverview stats={stats(0, 0)} />);

    expect(screen.getByText('Calls in selected period')).toBeInTheDocument();
    expect(screen.queryByText('Total Calls Today')).not.toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
    expect(screen.queryByText('0s')).not.toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  it('shows observed rates when calls exist', () => {
    render(<CallStatsOverview stats={stats(5, 2)} />);

    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText('4 of 5 calls ended')).toBeInTheDocument();
    expect(screen.getByText('1m')).toBeInTheDocument();
  });

  it.each([
    ['en', 'Ended calls', '1 of 1 calls ended', 'Completion Rate'],
    ['pt-BR', 'Chamadas encerradas', '1 de 1 chamadas encerradas', 'Taxa de Conclusão'],
    ['es', 'Llamadas finalizadas', '1 de 1 llamadas finalizadas', 'Tasa de Finalización'],
  ])('labels an ended information call without implying task success in %s', async (language, label, caption, oldLabel) => {
    await act(async () => { await i18n.changeLanguage(language); });
    const informationCall = stats(1, 0);
    informationCall.overview.completed_calls = 1;
    informationCall.overview.completion_rate = 100;
    render(<CallStatsOverview stats={informationCall} />);

    const metric = screen.getByText(label).parentElement!;
    expect(within(metric).getByText('100%')).toBeInTheDocument();
    expect(within(metric).getByText(caption)).toBeInTheDocument();
    expect(screen.queryByText(oldLabel)).not.toBeInTheDocument();
    expect(screen.getByText(i18n.t('callTracking.conversionRate', { rate: 0 }))).toBeInTheDocument();
  });
});
