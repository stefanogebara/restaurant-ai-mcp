import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import VoicePersonaPanel from '../VoicePersonaPanel';
import { authFetch } from '../../../services/api';

vi.mock('../../../services/api', () => ({ authFetch: vi.fn() }));
vi.mock('../../../contexts/ToastContext', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }) }));
const saved = { agent_name: 'Sofia', agent_greeting: 'Welcome!' };
const response = (body: object, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body }) as Response;
const api = vi.mocked(authFetch);
const saveButton = () => screen.getByRole('button', { name: /^Save (?:name and greeting|persona)$/ });
const refreshButton = () => screen.getByRole('button', { name: /^(?:Reapply saved greeting|Refresh Agent Prompt)$/ });
const retryButton = () => screen.getByRole('button', { name: 'Retry saved update' });
function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><VoicePersonaPanel /></QueryClientProvider>);
  return userEvent.setup();
}
async function loaded() { await screen.findByDisplayValue('Sofia'); }
async function rename(user: ReturnType<typeof userEvent.setup>) {
  await user.clear(screen.getByLabelText(/Agent name/));
  await user.type(screen.getByLabelText(/Agent name/), 'Marco');
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

describe('Voice persona save and recovery contract', () => {
  beforeEach(() => { vi.clearAllMocks(); api.mockResolvedValue(response(saved)); });

  it('blocks editing after GET fails and offers a safe retry', async () => {
    api.mockResolvedValueOnce(response({}, false)).mockResolvedValueOnce(response(saved));
    const user = setup();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the saved name and greeting. Try again before editing.');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await loaded();
    expect(api).toHaveBeenCalledTimes(2);
  });

  it('disables save when a field is reverted', async () => {
    const user = setup(); await loaded(); await rename(user);
    expect(saveButton()).toBeEnabled();
    await user.clear(screen.getByLabelText(/Agent name/));
    await user.type(screen.getByLabelText(/Agent name/), 'Sofia');
    expect(saveButton()).toBeDisabled();
  });

  it('locks fields and refresh during a save, then displays the saved response', async () => {
    const request = deferred<Response>();
    api.mockResolvedValueOnce(response(saved)).mockReturnValueOnce(request.promise);
    const user = setup(); await loaded(); await rename(user); await user.click(saveButton());
    await waitFor(() => expect(screen.getByLabelText(/Agent name/)).toBeDisabled());
    expect(screen.getByLabelText(/Opening greeting/)).toBeDisabled();
    expect(refreshButton()).toBeDisabled();
    await user.type(screen.getByLabelText(/Agent name/), ' newer');
    await act(async () => { request.resolve(response({ ...saved, agent_name: 'Marco', agent_synced: true, kb_synced: true })); });
    await waitFor(() => expect(screen.getByLabelText(/Agent name/)).toBeEnabled());
    expect(screen.getByLabelText(/Agent name/)).toHaveValue('Marco');
    expect(saveButton()).toBeDisabled();
  });

  it('only submits the name when the greeting was edited then reverted', async () => {
    const user = setup(); await loaded();
    await user.type(screen.getByLabelText(/Opening greeting/), ' extra');
    await user.clear(screen.getByLabelText(/Opening greeting/));
    await user.type(screen.getByLabelText(/Opening greeting/), 'Welcome!');
    await rename(user); await user.click(saveButton());
    expect(JSON.parse(String(api.mock.calls[1][1]?.body))).toEqual({ agent_name: 'Marco' });
  });

  it('keeps partial failures visible and retries the exact saved scope', async () => {
    api.mockResolvedValueOnce(response(saved))
      .mockResolvedValueOnce(response({ ...saved, agent_name: 'Marco', agent_synced: false, kb_synced: false }))
      .mockResolvedValueOnce(response({ ...saved, agent_name: 'Marco', agent_synced: true, kb_synced: true }));
    const user = setup(); await loaded(); await rename(user); await user.click(saveButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Saved in Seatable.');
    expect(screen.getByRole('alert')).toHaveTextContent('The voice agent did not update.');
    expect(screen.getByRole('alert')).toHaveTextContent('The menu and restaurant information did not update on the voice agent.');
    expect(saveButton()).toBeDisabled();
    await user.click(retryButton());
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(JSON.parse(String(api.mock.calls[2][1]?.body))).toEqual({ agent_name: 'Marco' });
    expect(screen.getByLabelText(/Agent name/)).toHaveValue('Marco');
  });

  it('does not clear a knowledge failure when reapplying the greeting succeeds', async () => {
    api.mockResolvedValueOnce(response(saved))
      .mockResolvedValueOnce(response({ ...saved, agent_name: 'Marco', agent_synced: false, kb_synced: false }))
      .mockResolvedValueOnce(response({ success: true }));
    const user = setup(); await loaded(); await rename(user); await user.click(saveButton());
    await screen.findByRole('alert'); await user.click(refreshButton());
    await waitFor(() => expect(screen.getByRole('alert')).not.toHaveTextContent('The voice agent did not update.'));
    expect(screen.getByRole('alert')).toHaveTextContent('The menu and restaurant information did not update on the voice agent.');
    expect(retryButton()).toBeEnabled();
    expect(api.mock.calls[2][1]).toEqual({ method: 'POST' });
  });

  it('blocks refresh with unsaved edits and explains what refresh covers', async () => {
    const user = setup(); await loaded();
    expect(refreshButton()).toBeEnabled();
    expect(screen.getByText('Reapplies the saved agent instructions and opening greeting. Does not update the menu or restaurant information.')).toBeInTheDocument();
    await rename(user);
    expect(refreshButton()).toBeDisabled();
    expect(screen.getByText('Save your edits before reapplying saved settings or retrying an update.')).toBeInTheDocument();
    await user.click(refreshButton()); expect(api).toHaveBeenCalledTimes(1);
  });

  it('preserves the draft and shows a persistent save error', async () => {
    api.mockResolvedValueOnce(response(saved)).mockResolvedValueOnce(response({}, false));
    const user = setup(); await loaded(); await rename(user); await user.click(saveButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save. Your edits are still here. Try again.');
    expect(screen.getByLabelText(/Agent name/)).toHaveValue('Marco'); expect(saveButton()).toBeEnabled();
  });

  it('does not count a skipped refresh as an agent update', async () => {
    api.mockResolvedValueOnce(response(saved))
      .mockResolvedValueOnce(response({ ...saved, agent_name: 'Marco', agent_synced: false, kb_synced: true }))
      .mockResolvedValueOnce(response({ success: true, skipped: true, reason: 'no_agent' }));
    const user = setup(); await loaded(); await rename(user); await user.click(saveButton());
    await screen.findByRole('alert'); await user.click(refreshButton());
    expect(await screen.findByText('The saved settings were not applied to a voice agent. Check the agent connection before retrying.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('The voice agent did not update.');
  });

  it('rejects non-OK refresh responses even if the response claims success', async () => {
    api.mockResolvedValueOnce(response(saved)).mockResolvedValueOnce(response({ success: true }, false));
    const user = setup(); await loaded(); await user.click(refreshButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reapply the saved settings. Try again.');
  });

  it('blocks editing and saving while a saved greeting is being reapplied', async () => {
    const request = deferred<Response>();
    api.mockResolvedValueOnce(response(saved)).mockReturnValueOnce(request.promise);
    const user = setup(); await loaded(); await user.click(refreshButton());
    await waitFor(() => expect(screen.getByLabelText(/Agent name/)).toBeDisabled());
    expect(screen.getByLabelText(/Opening greeting/)).toBeDisabled();
    expect(saveButton()).toBeDisabled();
    await act(async () => { request.resolve(response({ success: true })); });
    await waitFor(() => expect(screen.getByLabelText(/Agent name/)).toBeEnabled());
    expect(api).toHaveBeenCalledTimes(2);
  });

  it('keeps recovery tied to the saved version while a newer draft is unsaved', async () => {
    api.mockResolvedValueOnce(response(saved))
      .mockResolvedValueOnce(response({ ...saved, agent_name: 'Marco', agent_synced: true, kb_synced: false }));
    const user = setup(); await loaded(); await rename(user); await user.click(saveButton());
    await screen.findByRole('alert');
    await user.type(screen.getByLabelText(/Agent name/), ' newer');
    expect(retryButton()).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('These results apply to the last saved changes, not your current edits.');
    await user.click(retryButton()); expect(api).toHaveBeenCalledTimes(2);
    await user.clear(screen.getByLabelText(/Agent name/));
    await user.type(screen.getByLabelText(/Agent name/), 'Marco');
    expect(saveButton()).toBeDisabled(); expect(retryButton()).toBeEnabled();
  });

  it('does not claim live provider verification for non-applicable sync results', async () => {
    api.mockResolvedValueOnce(response(saved))
      .mockResolvedValueOnce(response({ ...saved, agent_name: 'Marco', agent_synced: null, kb_synced: null }));
    const user = setup(); await loaded(); await rename(user); await user.click(saveButton());
    expect(await screen.findByRole('status')).toHaveTextContent('Saved in Seatable.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry saved update' })).not.toBeInTheDocument();
    expect(screen.queryByText(/reapplied to the voice agent/)).not.toBeInTheDocument();
  });

});
