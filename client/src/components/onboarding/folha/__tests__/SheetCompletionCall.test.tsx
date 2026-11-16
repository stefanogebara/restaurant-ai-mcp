import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import SheetCompletion from '../SheetCompletion';

// 2026-11-16, first browser test call in production: after the goodbye the
// receptionist kept asking "Ainda está aí?" and the onboarding stood still.
// Now a call that ends moves the owner on to the dashboard.
type Voice = { agentState: string; transcript: Array<{ role: 'user' | 'agent'; text: string }>; error: string | null };
const voice: Voice = { agentState: 'idle', transcript: [], error: null };
vi.mock('../../../voice/useVoiceAgent', () => ({
  useVoiceAgent: () => ({
    ...voice, start: vi.fn(), stop: vi.fn(async () => {}), getInputVolume: () => 0, getOutputVolume: () => 0,
  }),
}));

const setup = { restaurant: 'ok', whatsapp_registry: 'ok', voice_agent: 'ok', knowledge_base: 'ok', subscription: 'ok' };

function view(goTo = vi.fn()) {
  const props = { setup, bookingUrl: 'https://seatable.one/book/casa', agentId: 'agent_casa1', restaurantName: 'Casa', goTo };
  const result = render(<SheetCompletion {...props} />);
  const update = (next: Partial<Voice>) => { Object.assign(voice, next); result.rerender(<SheetCompletion {...props} />); };
  return { goTo, update };
}

/** One second at a time, the way the countdown's timers fire. */
function tick(seconds: number) {
  for (let i = 0; i < seconds; i += 1) act(() => { vi.advanceTimersByTime(1000); });
}

beforeEach(() => { vi.useFakeTimers(); Object.assign(voice, { agentState: 'idle', transcript: [], error: null }); });
afterEach(() => { vi.useRealTimers(); });

describe('after the test call, the onboarding moves on', () => {
  it('names the booking she made and opens the dashboard after 8 seconds', () => {
    const { goTo, update } = view();
    expect(screen.queryByTestId('after-call')).not.toBeInTheDocument();
    update({ agentState: 'listening' });
    update({ agentState: 'talking', transcript: [{ role: 'agent', text: 'Sua reserva está confirmada. O código da reserva é RES-20261116-H-zB-VQKj-FS. Tchau!' }] });
    update({ agentState: 'idle' });

    expect(screen.getByTestId('after-call')).toHaveTextContent('Booking RES-20261116-H-zB-VQKj-FS is already on your dashboard.');
    expect(screen.getByText('Opening your dashboard in 8 s.')).toBeInTheDocument();
    tick(7);
    expect(screen.getByText('Opening your dashboard in 1 s.')).toBeInTheDocument();
    expect(goTo).not.toHaveBeenCalled();
    tick(1);
    expect(goTo).toHaveBeenCalledWith('/host-dashboard/simple?launch=1');
  });

  it('"Stay here" keeps the owner on the screen', () => {
    const { goTo, update } = view();
    update({ agentState: 'listening' });
    update({ agentState: 'idle' });
    expect(screen.getByTestId('after-call')).toHaveTextContent('Call ended.');
    fireEvent.click(screen.getByRole('button', { name: 'Stay here' }));
    tick(20);
    expect(goTo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Go to Dashboard' }));
    expect(goTo).toHaveBeenCalledWith('/host-dashboard/simple?launch=1');
  });

  it('a call that never connected (microphone refused) does not move on', () => {
    const { goTo, update } = view();
    update({ agentState: 'connecting' });
    update({ agentState: 'idle', error: 'Permission denied' });
    expect(screen.queryByTestId('after-call')).not.toBeInTheDocument();
    tick(20);
    expect(goTo).not.toHaveBeenCalled();
  });
});
