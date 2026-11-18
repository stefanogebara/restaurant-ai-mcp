import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Onboarding from '../Onboarding';
import { authFetch } from '../../services/api';

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'live-owner', email: 'owner@example.com' } }) }));
vi.mock('../../contexts/ToastContext', () => ({ useToast: () => ({ error: vi.fn(), success: vi.fn() }) }));
vi.mock('../../lib/analytics', () => ({ trackOnboardingStepCompleted: vi.fn(), trackOnboardingCompleted: vi.fn() }));
vi.mock('../../services/api', () => ({ authFetch: vi.fn() }));
const startCall = vi.fn();
vi.mock('../../components/voice/useVoiceAgent', () => ({
  useVoiceAgent: (options: { agentId: string; useSignedUrl?: boolean }) => {
    voiceOptions.push(options);
    return {
      agentState: 'idle', error: null, transcript: [], start: startCall, stop: vi.fn(),
      getInputVolume: () => 0, getOutputVolume: () => 0,
    };
  },
}));
const voiceOptions: Array<{ agentId: string; useSignedUrl?: boolean }> = [];

const api = vi.mocked(authFetch);
const noRestaurant = { restaurant: null, steps: {}, needs_recovery: false };
const originalFetch = globalThis.fetch;
afterAll(() => { globalThis.fetch = originalFetch; });

const draft = {
  restaurant_name: 'Casa Azul', restaurant_type: 'bistro', country: 'Brazil', country_code: 'BR', city: 'São Paulo',
  phone_number: '+5511999990000', email: 'contact@example.com', voz_preset: 'fast_efficient',
  business_hours: [{ day: 'Monday', is_open: true, open_time: '12:00', close_time: '23:00' }],
  areas: [{ name: 'Indoor', is_active: true, tables: [{ capacity: 4, count: 4, shape: 'square', is_joinable: true, is_fixed_seating: false }] }],
};

const frame = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;

/** A stream response whose events are released one by one by the test. */
function controlledStream() {
  const enc = new TextEncoder();
  let push!: (text: string) => void;
  let close!: () => void;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      push = (text) => controller.enqueue(enc.encode(text));
      close = () => controller.close();
    },
  });
  const response = {
    ok: true, status: 200, body,
    headers: new Headers({ 'content-type': 'text/event-stream' }),
    json: async () => { throw new Error('stream'); },
  } as unknown as Response;
  return { response, push: (o: unknown) => push(frame(o)), close: () => close() };
}

beforeEach(() => {
  localStorage.clear(); vi.clearAllMocks(); voiceOptions.length = 0;
  api.mockImplementation(async () => Response.json(noRestaurant));
});

describe('the onboarding sheet goes live in front of the owner', () => {
  it('turns each row when its event arrives, then offers the call, the link and the QR', async () => {
    localStorage.setItem('onboarding_step:live-owner', '1');
    localStorage.setItem('onboarding_data:live-owner', JSON.stringify(draft));
    const stream = controlledStream();
    api.mockImplementation(async (url) => (url === '/api/onboarding/complete'
      ? stream.response
      : Response.json(noRestaurant)));
    render(<MemoryRouter><Onboarding /></MemoryRouter>);

    fireEvent.click(await screen.findByRole('button', { name: 'Colocar no ar' }));
    expect(await screen.findByRole('heading', { name: 'Setting up Casa Azul.' })).toBeVisible();
    const [, init] = api.mock.calls.find(([url]) => url === '/api/onboarding/complete')!;
    expect(new Headers(init?.headers).get('Accept')).toBe('text/event-stream');
    expect(screen.getByTestId('launch-step-restaurant')).toHaveAttribute('data-state', 'working');
    expect(screen.getByTestId('launch-step-voice_agent')).toHaveAttribute('data-state', 'waiting');

    stream.push({ type: 'step', key: 'restaurant', status: 'ok', restaurant_id: 'r-1', booking_url: '/book/casa-azul', tables: 4, seats: 16 });
    await waitFor(() => expect(screen.getByTestId('launch-step-restaurant')).toHaveAttribute('data-state', 'done'));
    expect(screen.getByTestId('launch-step-restaurant')).toHaveTextContent('4 tables · 16 seats');
    expect(screen.getByTestId('launch-step-whatsapp_registry')).toHaveAttribute('data-state', 'working');

    stream.push({ type: 'step', key: 'whatsapp_registry', status: 'ok' });
    stream.push({ type: 'step', key: 'voice_agent', status: 'ok', language: 'pt', agent_id: 'agent_casa1' });
    stream.push({ type: 'step', key: 'knowledge_base', status: 'ok' });
    stream.push({ type: 'step', key: 'subscription', status: 'ok', plan: 'free', trial_end: null });
    stream.push({
      type: 'done', success: true,
      restaurant: { restaurant_id: 'r-1', booking_url: '/book/casa-azul', voice_agent_id: 'agent_casa1' },
      setup: { restaurant: 'ok', whatsapp_registry: 'ok', voice_agent: 'ok', knowledge_base: 'ok', subscription: 'ok' },
    });
    stream.close();

    expect(await screen.findByRole('heading', { name: 'Casa Azul is live.' })).toBeVisible();
    expect(screen.getByTestId('launch-step-voice_agent')).toHaveTextContent('speaks Portuguese');
    expect(screen.getByTestId('launch-step-subscription')).toHaveTextContent('free plan');
    expect(voiceOptions.at(-1)).toMatchObject({ agentId: 'agent_casa1', useSignedUrl: true });
    fireEvent.click(screen.getByRole('button', { name: 'Call her' }));
    expect(startCall).toHaveBeenCalled();
    expect(screen.getByRole('img', { name: 'QR code for your booking link' })).toHaveAttribute('src', '/api/booking-qr?slug=casa-azul');

    expect(localStorage.getItem('onboarding_data:live-owner:completed')).toBeNull();
  });

  it('a new owner starts with the Google search, and the pick opens the sheet with the Google photo', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ results: [{
        name: 'Casa Azul', city: 'Lisboa', address: 'Rua A, 1', phone: '+351210000000',
        rating: 4.6, review_count: 812, photo_ref: 'places/abc/photos/xyz',
      }] }),
    })) as unknown as typeof fetch;
    render(<MemoryRouter><Onboarding /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Which restaurant is yours?' })).toBeVisible();
    fireEvent.change(screen.getByLabelText(/Restaurant name/i), { target: { value: 'Casa Azul' } });
    fireEvent.change(screen.getByLabelText(/City/i), { target: { value: 'Lisboa' } });
    fireEvent.click(screen.getByRole('button', { name: /Search Google Maps/i }));
    fireEvent.click(await screen.findByTestId('step0-pick-0'));

    expect(await screen.findByText('4.6 on Google · 812 reviews')).toBeVisible();
    expect(document.querySelector('img[src*="maxWidth=1200"]')).not.toBeNull();
    expect(screen.queryByRole('heading', { name: 'Which restaurant is yours?' })).not.toBeInTheDocument();
    const hours = screen.getByRole('region', { name: /horários|hours/i });
    expect(within(hours).getByText('Initial hours — please confirm')).toBeVisible();
    expect(within(hours).queryByText(/do seu google|from your google/i)).not.toBeInTheDocument();
  });

  it('returns to the blank confirmation sheet after a new restaurant skips search and reloads', async () => {
    const tree = <MemoryRouter><Onboarding /></MemoryRouter>;
    const first = render(tree);
    fireEvent.click(await screen.findByRole('button', { name: /skip.*fill/i }));
    expect(screen.queryByRole('heading', { name: 'Which restaurant is yours?' })).not.toBeInTheDocument();

    first.unmount();
    render(tree);
    expect(screen.queryByRole('heading', { name: 'Which restaurant is yours?' })).not.toBeInTheDocument();
    expect(await screen.findByText('Initial hours — please confirm')).toBeVisible();
  });

  it('a demo convert never sees the Google search', () => {
    localStorage.setItem('pending_demo_token', 'demo-token');
    globalThis.fetch = vi.fn(async () => new Promise(() => {})) as unknown as typeof fetch;
    render(<MemoryRouter><Onboarding /></MemoryRouter>);
    expect(screen.queryByRole('heading', { name: 'Which restaurant is yours?' })).not.toBeInTheDocument();
  });
});
