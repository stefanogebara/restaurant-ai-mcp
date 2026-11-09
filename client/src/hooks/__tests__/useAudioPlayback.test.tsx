import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from 'i18next';
import { authFetch } from '../../services/api';
import { useAudioPlayback } from '../useAudioPlayback';
import { DEFAULT_VOICE_SETTINGS, type EnhancedVoice } from '../../components/voice/voiceTypes';
import VoiceCurrentCard from '../../components/voice/VoiceCurrentCard';
import VoiceTuningPanel from '../../components/voice/VoiceTuningPanel';

vi.mock('../../services/api', () => ({ authFetch: vi.fn() }));

class FakeAudio {
  static instances: FakeAudio[] = [];
  static nextPlay: Promise<void> | undefined;
  src: string;
  currentTime = 0;
  onended: (() => void) | null = null;
  onpause: (() => void) | null = null;
  onerror: (() => void) | null = null;
  play = vi.fn<() => Promise<void>>(() => {
    const pending = FakeAudio.nextPlay;
    FakeAudio.nextPlay = undefined;
    return pending ?? Promise.resolve();
  });
  pause = vi.fn();
  load = vi.fn();
  removeAttribute = vi.fn((name: string) => { if (name === 'src') this.src = ''; });
  constructor(src: string) { this.src = src; FakeAudio.instances.push(this); }
}
const response = (payload: unknown = { success: true, data: { audio: 'data:audio/mpeg;base64,dGVzdA==' } }, ok = true) => ({ ok, json: async () => payload }) as Response;
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
};
const options = () => ({
  voices: [] as EnhancedVoice[], currentVoiceId: 'voice-a', currentLanguage: 'pt',
  restaurantName: 'Casa Teste', currentSettings: { ...DEFAULT_VOICE_SETTINGS }, onError: vi.fn(),
});
const latestAudio = () => FakeAudio.instances.at(-1)!;
const requestBody = () => JSON.parse(String(vi.mocked(authFetch).mock.calls.at(-1)?.[1]?.body));

beforeEach(() => {
  FakeAudio.instances = [];
  FakeAudio.nextPlay = undefined;
  vi.stubGlobal('Audio', FakeAudio);
  vi.mocked(authFetch).mockReset().mockResolvedValue(response());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('useAudioPlayback correctness', () => {
  it('generates current text/settings instead of reusing a library sample, stopping that sample first', async () => {
    const props = options();
    props.voices = [{ id: 'voice-a', preview_url: 'https://example.test/sample.mp3' } as EnhancedVoice];
    const { result } = renderHook(() => useAudioPlayback(props));
    await act(async () => { await result.current.handlePlayVoice('voice-a', 'Library text'); });
    const sample = latestAudio();
    await act(async () => { await result.current.handlePreviewWithSettings(); });
    expect(sample.pause).toHaveBeenCalled();
    expect(authFetch).toHaveBeenCalledTimes(1);
    expect(requestBody()).toMatchObject({ voice_id: 'voice-a', voice_settings: props.currentSettings });
    expect(requestBody().text).toContain('Casa Teste');
    expect(requestBody().text).toContain('Bem-vindo');
  });

  it('invalidates playback when settings, language, or restaurant text change', async () => {
    const { result, rerender } = renderHook(props => useAudioPlayback(props), { initialProps: options() });
    await act(async () => { await result.current.handlePreviewWithSettings(); });
    const first = latestAudio();
    rerender({ ...options(), currentSettings: { ...DEFAULT_VOICE_SETTINGS, speed: 1.15 } });
    expect(first.pause).toHaveBeenCalled();
    expect(result.current.playingVoiceId).toBeNull();
    await act(async () => { await result.current.handlePreviewWithSettings(); });
    expect(requestBody().voice_settings.speed).toBe(1.15);
    rerender({ ...options(), currentLanguage: 'es', restaurantName: 'Casa Nueva' });
    await act(async () => { await result.current.handlePreviewWithSettings(); });
    expect(requestBody().text).toContain('Bienvenido');
    expect(requestBody().text).toContain('Casa Nueva');
    expect(authFetch).toHaveBeenCalledTimes(3);
  });

  it('toggles configured playback and caches only identical previews', async () => {
    const { result } = renderHook(() => useAudioPlayback(options()));
    await act(async () => { await result.current.handlePreviewWithSettings(); });
    const first = latestAudio();
    await act(async () => { await result.current.handlePreviewWithSettings(); });
    expect(first.pause).toHaveBeenCalled();
    expect(result.current.playingVoiceId).toBeNull();
    await act(async () => { await result.current.handlePreviewWithSettings(); });
    expect(authFetch).toHaveBeenCalledTimes(1);
    expect(result.current.playingVoiceId).toBe('voice-a');
  });

  it('includes library text in the cache identity', async () => {
    const { result } = renderHook(() => useAudioPlayback(options()));
    await act(async () => { await result.current.handlePlayVoice('voice-a', 'First phrase'); });
    await act(async () => { await result.current.handlePlayVoice('voice-a', 'First phrase'); });
    await act(async () => { await result.current.handlePlayVoice('voice-a', 'Other phrase'); });
    expect(authFetch).toHaveBeenCalledTimes(2);
    expect(requestBody().text).toBe('Other phrase');
  });

  it('bounds retained previews and pauses every prior audio', async () => {
    const { result } = renderHook(() => useAudioPlayback(options()));
    for (let i = 0; i < 12; i++) {
      await act(async () => { await result.current.handlePlayVoice(`voice-${i}`, 'Hello'); });
    }
    await act(async () => { await result.current.handlePlayVoice('voice-0', 'Hello'); });
    expect(authFetch).toHaveBeenCalledTimes(13);
    expect(FakeAudio.instances.slice(0, -1).every(audio => audio.pause.mock.calls.length > 0)).toBe(true);
  });

  it('aborts a superseded generation and ignores its late response', async () => {
    const old = deferred<Response>();
    vi.mocked(authFetch).mockReturnValueOnce(old.promise);
    const { result } = renderHook(() => useAudioPlayback(options()));
    let first!: Promise<void>;
    act(() => { first = result.current.handlePlayVoice('old', 'Old'); });
    const signal = vi.mocked(authFetch).mock.calls[0][1]?.signal;
    await act(async () => { await result.current.handlePlayVoice('new', 'New'); });
    expect(signal?.aborted).toBe(true);
    await act(async () => { old.resolve(response()); await first; });
    expect(result.current.playingVoiceId).toBe('new');
    expect(FakeAudio.instances).toHaveLength(1);
  });

  it('invalidates in-flight generation when the pending language changes', async () => {
    const old = deferred<Response>();
    vi.mocked(authFetch).mockReturnValueOnce(old.promise);
    const { result, rerender } = renderHook(props => useAudioPlayback(props), { initialProps: options() });
    let pending!: Promise<void>;
    act(() => { pending = result.current.handlePreviewWithSettings(); });
    const signal = vi.mocked(authFetch).mock.calls[0][1]?.signal;
    rerender({ ...options(), currentLanguage: 'es' });
    expect(signal?.aborted).toBe(true);
    await act(async () => { old.resolve(response()); await pending; });
    expect(FakeAudio.instances).toHaveLength(0);
    expect(result.current.loadingAudio).toBeNull();
    await act(async () => { await result.current.handlePreviewWithSettings(); });
    expect(requestBody().text).toContain('Bienvenido');
  });

  it('does not let an old failure clear the newer spinner or show an error', async () => {
    const old = deferred<Response>();
    const next = deferred<Response>();
    vi.mocked(authFetch).mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    const props = options();
    const { result } = renderHook(() => useAudioPlayback(props));
    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => { first = result.current.handlePlayVoice('old', 'Old'); });
    act(() => { second = result.current.handlePlayVoice('new', 'New'); });
    await act(async () => { old.resolve(response({}, false)); await first; });
    expect(result.current.loadingAudio).toBe('new');
    expect(props.onError).not.toHaveBeenCalled();
    await act(async () => { next.resolve(response()); await second; });
  });

  it('keeps library and configured playback indicators separate for the same voice', async () => {
    const props = options();
    props.voices = [{ id: 'voice-a', preview_url: 'https://example.test/sample.mp3' } as EnhancedVoice];
    const { result } = renderHook(() => useAudioPlayback(props));
    await act(async () => { await result.current.handlePreviewWithSettings(); });
    expect(result.current.playingSource).toBe('configured');
    const configured = latestAudio();
    await act(async () => { await result.current.handlePlayVoice('voice-a', 'Library text'); });
    expect(result.current.playingSource).toBe('library');
    expect(configured.pause).toHaveBeenCalled();
    expect(latestAudio().src).toBe('https://example.test/sample.mp3');
  });

  it('stops the ElevenLabs preview when that engine is no longer selected', async () => {
    const { result, rerender } = renderHook(props => useAudioPlayback(props), { initialProps: { ...options(), enabled: true } });
    await act(async () => { await result.current.handlePreviewWithSettings(); });
    const audio = latestAudio();
    rerender({ ...options(), enabled: false });
    expect(audio.pause).toHaveBeenCalled();
    expect(result.current.playingVoiceId).toBeNull();
    await act(async () => { await result.current.handlePreviewWithSettings(); });
    expect(authFetch).toHaveBeenCalledTimes(1);
  });

  it('stops only library playback when its controls are closed', async () => {
    const { result } = renderHook(() => useAudioPlayback(options()));
    await act(async () => { await result.current.handlePlayVoice('voice-a', 'Library text'); });
    const sample = latestAudio();
    act(() => { result.current.stopPlayback('library'); });
    expect(sample.pause).toHaveBeenCalled();
    expect(sample.src).toBe('');
    expect(result.current.playingSource).toBeNull();
    expect(result.current.loadingSource).toBeNull();
  });

  it('cancels pending library generation when its controls close', async () => {
    const pending = deferred<Response>();
    vi.mocked(authFetch).mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() => useAudioPlayback(options()));
    let playback!: Promise<void>;
    act(() => { playback = result.current.handlePlayVoice('voice-a', 'Library text'); });
    const signal = vi.mocked(authFetch).mock.calls[0][1]?.signal;
    act(() => { result.current.stopPlayback('library'); });
    expect(signal?.aborted).toBe(true);
    await act(async () => { pending.resolve(response()); await playback; });
    expect(FakeAudio.instances).toHaveLength(0);
    expect(result.current.loadingAudio).toBeNull();
  });

  it('preserves configured playback when the library closes', async () => {
    const { result } = renderHook(() => useAudioPlayback(options()));
    await act(async () => { await result.current.handlePreviewWithSettings(); });
    const configured = latestAudio();
    act(() => { result.current.stopPlayback('library'); });
    expect(configured.pause).not.toHaveBeenCalled();
    expect(result.current.playingSource).toBe('configured');
  });

  it('preserves pending configured generation when the library closes', async () => {
    const pending = deferred<Response>();
    vi.mocked(authFetch).mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() => useAudioPlayback(options()));
    let playback!: Promise<void>;
    act(() => { playback = result.current.handlePreviewWithSettings(); });
    const signal = vi.mocked(authFetch).mock.calls[0][1]?.signal;
    act(() => { result.current.stopPlayback('library'); });
    expect(signal?.aborted).toBe(false);
    expect(result.current.loadingSource).toBe('configured');
    await act(async () => { pending.resolve(response()); await playback; });
    expect(result.current.playingSource).toBe('configured');
  });

  it('bounds a hung generation, aborting it and ignoring its later response', async () => {
    vi.useFakeTimers();
    try {
      const old = deferred<Response>();
      vi.mocked(authFetch).mockReturnValueOnce(old.promise);
      const props = options();
      const { result } = renderHook(() => useAudioPlayback(props));
      let pending!: Promise<void>;
      act(() => { pending = result.current.handlePreviewWithSettings(); });
      const signal = vi.mocked(authFetch).mock.calls[0][1]?.signal;
      act(() => { vi.advanceTimersByTime(30_000); });
      expect(signal?.aborted).toBe(true);
      expect(props.onError).toHaveBeenCalledExactlyOnceWith('previewFailed');
      expect(result.current.loadingAudio).toBeNull();
      await act(async () => { old.resolve(response()); await pending; });
      expect(FakeAudio.instances).toHaveLength(0);
    } finally { vi.useRealTimers(); }
  });

  it('ignores late play completion and ended events from an old audio', async () => {
    const pending = deferred<void>();
    FakeAudio.nextPlay = pending.promise;
    const { result } = renderHook(() => useAudioPlayback(options()));
    let old!: Promise<void>;
    act(() => { old = result.current.handlePlayVoice('old', 'Old'); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const ended = latestAudio().onended;
    await act(async () => { await result.current.handlePlayVoice('new', 'New'); });
    await act(async () => { pending.resolve(); await old; ended?.(); });
    expect(result.current.playingVoiceId).toBe('new');
    expect(FakeAudio.instances[0].pause).toHaveBeenCalled();
  });

  it('pauses and releases playback on unmount', async () => {
    const { result, unmount } = renderHook(() => useAudioPlayback(options()));
    await act(async () => { await result.current.handlePreviewWithSettings(); });
    const audio = latestAudio();
    unmount();
    expect(audio.pause).toHaveBeenCalled();
    expect(audio.src).toBe('');
    expect(audio.onended).toBeNull();
  });

  it('aborts pending work on unmount without late audio or error', async () => {
    const old = deferred<Response>();
    vi.mocked(authFetch).mockReturnValueOnce(old.promise);
    const props = options();
    const { result, unmount } = renderHook(() => useAudioPlayback(props));
    let pending!: Promise<void>;
    act(() => { pending = result.current.handlePlayVoice('voice-a', 'Hello'); });
    const signal = vi.mocked(authFetch).mock.calls[0][1]?.signal;
    unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => { old.resolve(response()); await pending; });
    expect(FakeAudio.instances).toHaveLength(0);
    expect(props.onError).not.toHaveBeenCalled();
  });

  it.each([
    { success: false, error: 'Provider details' }, { success: true, data: {} },
    { success: true }, { success: true, data: { audio: '' } },
  ])('reports an unusable HTTP 200 response: %j', async payload => {
    vi.mocked(authFetch).mockResolvedValueOnce(response(payload));
    const props = options();
    const { result } = renderHook(() => useAudioPlayback(props));
    await act(async () => { await result.current.handlePreviewWithSettings(); });
    expect(props.onError).toHaveBeenCalledWith('previewFailed');
    expect(result.current.loadingAudio).toBeNull();
    expect(result.current.playingVoiceId).toBeNull();
    expect(FakeAudio.instances).toHaveLength(0);
  });

  it('reports network and HTTP failures', async () => {
    const props = options();
    const { result } = renderHook(() => useAudioPlayback(props));
    vi.mocked(authFetch).mockRejectedValueOnce(new Error('offline'));
    await act(async () => { await result.current.handlePreviewWithSettings(); });
    vi.mocked(authFetch).mockResolvedValueOnce(response({}, false));
    await act(async () => { await result.current.handlePreviewWithSettings(); });
    expect(props.onError).toHaveBeenCalledTimes(2);
    expect(props.onError).toHaveBeenLastCalledWith('previewFailed');
  });

  it('catches cached play rejection and reports playback failure', async () => {
    const props = options();
    const { result } = renderHook(() => useAudioPlayback(props));
    await act(async () => { await result.current.handlePlayVoice('voice-a', 'Hello'); });
    await act(async () => { await result.current.handlePlayVoice('voice-a', 'Hello'); });
    FakeAudio.nextPlay = Promise.reject(new Error('NotAllowedError'));
    await act(async () => { await result.current.handlePlayVoice('voice-a', 'Hello'); });
    expect(props.onError).toHaveBeenCalledWith('previewPlaybackFailed');
    expect(result.current.playingVoiceId).toBeNull();
    expect(result.current.loadingAudio).toBeNull();
  });

  it('reports media failure and clears playback', async () => {
    const props = options();
    const { result } = renderHook(() => useAudioPlayback(props));
    await act(async () => { await result.current.handlePreviewWithSettings(); });
    act(() => { latestAudio().onerror?.(); });
    expect(props.onError).toHaveBeenCalledWith('previewPlaybackFailed');
    expect(result.current.playingVoiceId).toBeNull();
  });

  it('clears the playing indicator when the browser pauses the audio', async () => {
    const props = options();
    const { result } = renderHook(() => useAudioPlayback(props));
    await act(async () => { await result.current.handlePreviewWithSettings(); });
    act(() => { latestAudio().onpause?.(); });
    expect(result.current.playingVoiceId).toBeNull();
    expect(props.onError).not.toHaveBeenCalled();
  });

  it('reports a missing voice through the page callback', async () => {
    const props = { ...options(), currentVoiceId: '' };
    const { result } = renderHook(() => useAudioPlayback(props));
    await act(async () => { await result.current.handlePreviewWithSettings(); });
    expect(props.onError).toHaveBeenCalledWith('previewNoVoice');
    expect(authFetch).not.toHaveBeenCalled();
  });
});

describe('configured preview controls', () => {
  it('retains the descriptive tuning action and explains the preview', () => {
    render(<VoiceTuningPanel settings={DEFAULT_VOICE_SETTINGS} currentVoiceId="a" loadingAudio={null}
      onSettingChange={vi.fn()} onApplyPreset={vi.fn()} onReset={vi.fn()} onPreview={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Hear how it sounds' })).toHaveAccessibleDescription(i18n.t('voiceSettings.previewHint'));
  });
  it('labels the current preview Pause while it is playing', () => {
    render(<VoiceCurrentCard currentVoiceId="a" pendingVoiceId={null} selectedBrowserVoice={undefined}
      savedVoiceName="Test" savedVoiceId="a" currentLanguage="pt" restaurantName="Test"
      isBrowserOpen={false} loadingAudio={null} playingVoiceId="a" onPlay={vi.fn()} onToggleBrowser={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('labels tuning Pause while the configured preview is playing', () => {
    const props = { settings: DEFAULT_VOICE_SETTINGS, currentVoiceId: 'a', loadingAudio: null,
      playingVoiceId: 'a', onSettingChange: vi.fn(), onApplyPreset: vi.fn(), onReset: vi.fn(), onPreview: vi.fn() };
    render(<VoiceTuningPanel {...props} />);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });
});
