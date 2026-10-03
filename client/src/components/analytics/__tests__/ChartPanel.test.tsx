import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ChartPanel, { ChartBadge } from '../ChartPanel';

describe('ChartPanel', () => {
  it('renders the title as a heading and wraps content in a paper chart surface', () => {
    const { container } = render(
      <ChartPanel title="Reservas ao longo do tempo">
        <p>conteúdo</p>
      </ChartPanel>,
    );
    expect(screen.getByRole('heading', { name: 'Reservas ao longo do tempo' })).toBeInTheDocument();
    expect(container.querySelector('section')).toHaveClass('border-brand-line', 'bg-[#F8F6F0]');
    expect(screen.getByText('conteúdo')).toBeInTheDocument();
  });

  it('exposes the chart body to screen readers only when a label is given', () => {
    const { rerender } = render(
      <ChartPanel title="T" ariaLabel="Tendência de reservas">
        <span>x</span>
      </ChartPanel>,
    );
    expect(screen.getByRole('img', { name: 'Tendência de reservas' })).toBeInTheDocument();

    rerender(<ChartPanel title="T"><span>x</span></ChartPanel>);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders an optional badge', () => {
    render(
      <ChartPanel title="T" badge={<ChartBadge tone="up">Em alta</ChartBadge>}>
        <span>x</span>
      </ChartPanel>,
    );
    expect(screen.getByText('Em alta')).toBeInTheDocument();
  });
});
