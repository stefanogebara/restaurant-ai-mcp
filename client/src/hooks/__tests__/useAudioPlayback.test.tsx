import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));
vi.mock('../../services/api', () => ({ authFetch: mockFetch }));

import { useAudioPlayback } from '../useAudioPlayback';

const settings = { stability: 0.55, similarity_boost: 0.8, style: 0.25, speed: 1 };

describe('useAudioPlayback', () => {
  const play = vi.fn().mockResolvedValue(undefined);
  const pause = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('Audio', class {
      play = play;
      pause = pause;
      onended: (() => void) | null = null;
      currentTime = 0;
      duration = 4;
      ended = false;
      constructor(src: string) { void src; }
    });
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { audio: 'data:audio/mp3;base64,AAAA' } }),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('speaks the displayed restaurant greeting with current tuning, then pauses it', async () => {
    const { result } = renderHook(() => useAudioPlayback({
      voices: [], currentVoiceId: 'voice-1', currentLanguage: 'pt',
      restaurantName: 'Cantina Preview', currentSettings: settings,
    }));

    await act(async () => result.current.handlePreviewWithSettings({ info: vi.fn() }));
    await waitFor(() => expect(result.current.playingVoiceId).toBe('voice-1'));
    expect(mockFetch).toHaveBeenCalledWith('/api/elevenlabs-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        voice_id: 'voice-1',
        text: 'Olá, você ligou para Cantina Preview! Posso ajudar com uma reserva?',
        voice_settings: settings,
      }),
    });
    expect(play).toHaveBeenCalledOnce();
    expect(result.current.isSamplePlaying).toBe(true);

    await act(async () => result.current.handlePreviewWithSettings({ info: vi.fn() }));
    expect(pause).toHaveBeenCalledOnce();
    expect(result.current.playingVoiceId).toBeNull();
    expect(result.current.isSamplePlaying).toBe(false);
  });

  it('starts the tuned sample after a library preview of the same voice', async () => {
    const { result } = renderHook(() => useAudioPlayback({
      voices: [{ id: 'voice-1', name: 'Lia', description: '', language: 'pt', gender: 'female', preview_phrase: 'Library sample', preview_url: 'https://example.test/preview.mp3' }],
      currentVoiceId: 'voice-1', currentLanguage: 'pt', restaurantName: 'Cantina Preview', currentSettings: settings,
    }));

    await act(async () => result.current.handlePlayVoice('voice-1', 'Library sample'));
    expect(result.current.isSamplePlaying).toBe(false);

    await act(async () => result.current.handlePreviewWithSettings({ info: vi.fn() }));
    await waitFor(() => expect(result.current.isSamplePlaying).toBe(true));
    expect(pause).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(play).toHaveBeenCalledTimes(2);
  });

  it('speaks the exact unsaved line passed by the listening room', async () => {
    const { result } = renderHook(() => useAudioPlayback({
      voices: [], currentVoiceId: 'voice-1', currentLanguage: 'pt',
      restaurantName: 'Cantina Preview', currentSettings: settings,
    }));
    await act(async () => result.current.handlePreviewWithSettings({ info: vi.fn() }, '  Olá, posso ajudar?  '));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledOnce());
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).text).toBe('Olá, posso ajudar?');
  });

  it('reuses a paused generated sample and seeks within its real duration', async () => {
    const { result } = renderHook(() => useAudioPlayback({
      voices: [], currentVoiceId: 'voice-1', currentLanguage: 'pt',
      restaurantName: 'Cantina Preview', currentSettings: settings,
    }));
    await act(async () => result.current.handlePreviewWithSettings({ info: vi.fn() }, 'Boa noite.'));
    expect(result.current.sampleDuration).toBe(4);
    act(() => result.current.seekSample(0.5));
    expect(result.current.sampleCurrentTime).toBe(2);
    await act(async () => result.current.handlePreviewWithSettings({ info: vi.fn() }, 'Boa noite.'));
    await act(async () => result.current.handlePreviewWithSettings({ info: vi.fn() }, 'Boa noite.'));
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(play).toHaveBeenCalledTimes(2);
  });

  it('stops the old line when the editor changes during playback', async () => {
    const { result, rerender } = renderHook(({ line }) => useAudioPlayback({
      voices: [], currentVoiceId: 'voice-1', currentLanguage: 'pt',
      restaurantName: 'Cantina Preview', currentSettings: settings, sampleText: line,
    }), { initialProps: { line: 'Boa noite.' } });
    await act(async () => result.current.handlePreviewWithSettings({ info: vi.fn() }, 'Boa noite.'));
    expect(result.current.isSamplePlaying).toBe(true);
    rerender({ line: 'Olá, outra linha.' });
    expect(pause).toHaveBeenCalledOnce();
    expect(result.current.isSamplePlaying).toBe(false);
    expect(result.current.sampleDuration).toBe(0);
  });

  it('invalidates a saved line preview when the language changes', async () => {
    const { result, rerender } = renderHook(({ language }) => useAudioPlayback({
      voices: [], currentVoiceId: 'voice-1', currentLanguage: language,
      restaurantName: 'Cantina Preview', currentSettings: settings, sampleText: 'Welcome.',
    }), { initialProps: { language: 'en' } });
    await act(async () => result.current.handlePreviewWithSettings({ info: vi.fn() }, 'Welcome.'));
    rerender({ language: 'pt' });
    expect(pause).toHaveBeenCalledOnce();
    await act(async () => result.current.handlePreviewWithSettings({ info: vi.fn() }, 'Welcome.'));
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('reports an empty preview response without claiming playback', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ success: false, data: {} }) });
    const error = vi.fn();
    const { result } = renderHook(() => useAudioPlayback({
      voices: [], currentVoiceId: 'voice-1', currentLanguage: 'pt',
      restaurantName: 'Cantina Preview', currentSettings: settings,
    }));
    await act(async () => result.current.handlePreviewWithSettings({ info: vi.fn(), error }, 'Boa noite.'));
    expect(error).toHaveBeenCalledOnce();
    expect(result.current.isSamplePlaying).toBe(false);
  });

  it('does not audition a different default line when the editor is blank', async () => {
    const info = vi.fn();
    const { result } = renderHook(() => useAudioPlayback({
      voices: [], currentVoiceId: 'voice-1', currentLanguage: 'pt',
      restaurantName: 'Cantina Preview', currentSettings: settings, sampleText: '',
    }));
    await act(async () => result.current.handlePreviewWithSettings({ info }, '  '));
    expect(info).toHaveBeenCalledOnce();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
