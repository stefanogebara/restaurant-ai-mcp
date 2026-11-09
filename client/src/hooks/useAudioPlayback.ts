import { useCallback, useEffect, useRef, useState } from 'react';
import { authFetch } from '../services/api';
import { getPreviewText } from '../components/voice/voiceConstants';
import type { EnhancedVoice, VoiceSettings } from '../components/voice/voiceTypes';

export type VoicePreviewError = 'previewFailed' | 'previewPlaybackFailed' | 'previewNoVoice';
type PreviewSource = 'configured' | 'library';
interface Playback { voiceId: string; source: PreviewSource; key: string }
interface UseAudioPlaybackOptions {
  voices: EnhancedVoice[];
  currentVoiceId: string;
  currentLanguage: string;
  restaurantName?: string;
  currentSettings: VoiceSettings;
  enabled?: boolean;
  onError?: (error: VoicePreviewError) => void;
}

const MAX_CACHED_PREVIEWS = 8;
const PREVIEW_TIMEOUT_MS = 30_000;

export function useAudioPlayback({ voices, currentVoiceId, currentLanguage, restaurantName, currentSettings, enabled = true, onError }: UseAudioPlaybackOptions) {
  const [playing, setPlaying] = useState<Playback | null>(null);
  const [loading, setLoading] = useState<Playback | null>(null);
  // Cache sources, not media elements. Only one media element may be active.
  const cacheRef = useRef(new Map<string, string>());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const operationRef = useRef(0);
  const activeKeyRef = useRef<string | null>(null);
  const activeSourceRef = useRef<PreviewSource | null>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const stop = useCallback(() => {
    operationRef.current++;
    activeKeyRef.current = null;
    activeSourceRef.current = null;
    requestRef.current?.abort();
    requestRef.current = null;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    const audio = audioRef.current;
    audioRef.current = null;
    if (audio) {
      audio.onended = null;
      audio.onpause = null;
      audio.onerror = null;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
  }, []);

  const stopPlayback = useCallback((source?: PreviewSource) => {
    if (source && activeSourceRef.current !== source) return;
    stop();
    setPlaying(null);
    setLoading(null);
  }, [stop]);

  const text = getPreviewText(currentLanguage, restaurantName);
  const configurationKey = JSON.stringify([currentVoiceId, currentLanguage, text,
    currentSettings.stability, currentSettings.similarity_boost, currentSettings.style, currentSettings.speed, enabled]);

  useEffect(() => {
    stop();
    setPlaying(null);
    setLoading(null);
    return stop;
  }, [configurationKey, stop]);

  useEffect(() => () => cacheRef.current.clear(), []);

  const playPreview = async (voiceId: string, previewText: string, source: PreviewSource, sampleUrl?: string) => {
    if (!enabled) return;
    if (!voiceId) {
      stop();
      setPlaying(null);
      setLoading(null);
      onErrorRef.current?.('previewNoVoice');
      return;
    }
    // A library recording must never stand in for a configured greeting.
    const key = JSON.stringify([source, voiceId, previewText, currentLanguage,
      currentSettings.stability, currentSettings.similarity_boost, currentSettings.style, currentSettings.speed,
      sampleUrl ?? null]);
    const isPlaying = activeKeyRef.current === key && audioRef.current !== null;
    stop();
    setPlaying(null);
    setLoading(null);
    if (isPlaying) return;

    const operation = operationRef.current;
    activeSourceRef.current = source;
    const isCurrent = () => operationRef.current === operation;
    const playback = { voiceId, source, key };
    let failure: VoicePreviewError = 'previewFailed';
    const fail = (error: VoicePreviewError) => {
      if (!isCurrent()) return;
      cacheRef.current.delete(key);
      stop();
      setPlaying(null);
      setLoading(null);
      onErrorRef.current?.(error);
    };
    setLoading(playback);
    timeoutRef.current = setTimeout(() => fail(failure), PREVIEW_TIMEOUT_MS);
    try {
      let audioSource = cacheRef.current.get(key) ?? sampleUrl;
      if (!audioSource) {
        const controller = new AbortController();
        requestRef.current = controller;
        const response = await authFetch('/api/elevenlabs-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({ voice_id: voiceId, text: previewText,
            ...(source === 'configured' ? { voice_settings: currentSettings } : {}) }),
        });
        if (!isCurrent()) return;
        if (!response.ok) throw new Error('Preview request failed');
        const result = await response.json();
        if (!isCurrent()) return;
        const generatedAudio = result?.data?.audio;
        if (result?.success !== true || typeof generatedAudio !== 'string' || !generatedAudio.trim()) {
          throw new Error('Preview audio missing');
        }
        audioSource = generatedAudio;
      }
      if (!isCurrent()) return;
      // Refresh LRU position and evict old audio data, keeping memory bounded.
      cacheRef.current.delete(key);
      cacheRef.current.set(key, audioSource);
      if (cacheRef.current.size > MAX_CACHED_PREVIEWS) {
        cacheRef.current.delete(cacheRef.current.keys().next().value!);
      }
      failure = 'previewPlaybackFailed';
      const audio = new Audio(audioSource);
      audioRef.current = audio;
      activeKeyRef.current = key;
      audio.onended = () => {
        if (!isCurrent()) return;
        stop();
        setPlaying(null);
        setLoading(null);
      };
      audio.onpause = audio.onended;
      audio.onerror = () => fail('previewPlaybackFailed');
      await audio.play();
      if (!isCurrent()) return;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      setPlaying(playback);
    } catch {
      fail(failure);
    } finally {
      // A stale request must never clear the newer request's spinner or state.
      if (isCurrent()) setLoading(null);
    }
  };

  const handlePlayVoice = (voiceId: string, previewText: string) =>
    playPreview(voiceId, previewText, 'library', voices.find(voice => voice.id === voiceId)?.preview_url);

  const handlePreviewWithSettings = () => playPreview(currentVoiceId, text, 'configured');

  return {
    playingVoiceId: playing?.voiceId ?? null,
    playingSource: playing?.source ?? null,
    loadingAudio: loading?.voiceId ?? null,
    loadingSource: loading?.source ?? null,
    handlePlayVoice,
    handlePreviewWithSettings,
    stopPlayback,
  };
}
