/**
 * Phase AA — DepositSuggestChip component tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DepositSuggestChip from '../DepositSuggestChip';

// Stub i18n so the chip falls back to defaultValue strings.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: string) => defaultValue ?? _key,
  }),
}));

describe('DepositSuggestChip', () => {
  it('renders nothing when suggested is false', () => {
    const { container } = render(<DepositSuggestChip suggested={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when suggested is undefined', () => {
    const { container } = render(<DepositSuggestChip />);
    expect(container.firstChild).toBeNull();
  });

  it('renders as a button when onRequestDeposit is provided', () => {
    const onClick = vi.fn();
    render(
      <DepositSuggestChip
        suggested={true}
        reason="very_high_no_show_risk"
        onRequestDeposit={onClick}
      />,
    );
    const btn = screen.getByRole('button', { name: /request deposit/i });
    expect(btn).toBeInTheDocument();
  });

  it('renders as a static span when no handler is provided', () => {
    render(<DepositSuggestChip suggested={true} reason="high_no_show_risk" />);
    // No button — it's purely informational without a handler.
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText(/request deposit/i)).toBeInTheDocument();
  });

  it('fires onRequestDeposit when clicked', () => {
    const onClick = vi.fn();
    render(
      <DepositSuggestChip suggested={true} onRequestDeposit={onClick} />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('stops click propagation so the row click handler does not also fire', () => {
    const chipClick = vi.fn();
    const rowClick = vi.fn();
    render(
      <div onClick={rowClick}>
        <DepositSuggestChip suggested={true} onRequestDeposit={chipClick} />
      </div>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(chipClick).toHaveBeenCalledTimes(1);
    expect(rowClick).not.toHaveBeenCalled();
  });

  it('surfaces a translated tooltip for known reasons', () => {
    render(
      <DepositSuggestChip suggested={true} reason="very_high_no_show_risk" />,
    );
    const node = screen.getByText(/request deposit/i);
    // Tooltip text is on the title attribute of the parent span/button.
    const tip = node.closest('[title]')?.getAttribute('title') ?? '';
    expect(tip.toLowerCase()).toContain('no-show');
  });

  it('handles arbitrary risk_score_* reason strings gracefully', () => {
    render(
      <DepositSuggestChip suggested={true} reason="risk_score_82_above_threshold_51" />,
    );
    const node = screen.getByText(/request deposit/i);
    const tip = node.closest('[title]')?.getAttribute('title') ?? '';
    expect(tip).toMatch(/82|threshold/i);
  });
});
