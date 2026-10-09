import { useState, useRef } from 'react';
import { authFetch } from '../services/api';
import { getPreviewText } from '../components/voice/voiceConstants';
import type { EnhancedVoice, VoiceSettings } from '../components/voice/voiceTypes';

interface UseAudioPlaybackOptions {
  voices: EnhancedVoice[];
  currentVoiceId: string;
  currentLanguage: string;
  restaurantName?: string;
  currentSettings: VoiceSettings;
}

export function useAudioPlayback({ voices, currentVoiceId, currentLanguage, restaurantName, currentSettings }: UseAudioPlaybackOptions) {
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [playingKind, setPlayingKind] = useState<'browser' | 'sample' | null>(null);
  const [loadingAudio, setLoadingAudio] = useState<string | null>(null);
  const audioElementsRef = useRef<Record<string, HTMLAudioElement>>({});
  const activeAudioKeyRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);

  const stopActive = () => {
    const key = activeAudioKeyRef.current;
    if (key) audioElementsRef.current[key]?.pause();
    activeAudioKeyRef.current = null;
    setPlayingVoiceId(null);
    setPlayingKind(null);
  };

  const generatePreview = async (voiceId: string, text: string, kind: 'browser' | 'sample', settings?: VoiceSettings) => {
    const requestId = ++requestIdRef.current;
    try {
      const body: Record<string, unknown> = { voice_id: voiceId, text };
      if (settings) body.voice_settings = settings;
      const response = await authFetch('/api/elevenlabs-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error('Preview failed');
      const result = await response.json();
      if (requestId !== requestIdRef.current) return;
      if (result.success && result.data.audio) {
        const audio = new Audio(result.data.audio);
        const key = `${kind}:${voiceId}`;
        audio.onended = () => {
          if (activeAudioKeyRef.current === key) stopActive();
        };
        audioElementsRef.current[key] = audio;
        await audio.play();
        if (requestId !== requestIdRef.current) { audio.pause(); return; }
        activeAudioKeyRef.current = key;
        setPlayingVoiceId(voiceId);
        setPlayingKind(kind);
      }
    } catch (error) {
      console.error('Preview error:', error);
    } finally {
      if (requestId === requestIdRef.current) setLoadingAudio(null);
    }
  };

  const handlePlayVoice = async (voiceId: string, previewText: string) => {
    if (playingVoiceId === voiceId && playingKind === 'browser') {
      ++requestIdRef.current;
      stopActive();
      return;
    }
    const requestId = ++requestIdRef.current;
    stopActive();
    const key = `browser:${voiceId}`;
    if (audioElementsRef.current[key]) {
      audioElementsRef.current[key].currentTime = 0;
      try {
        await audioElementsRef.current[key].play();
        if (requestId !== requestIdRef.current) { audioElementsRef.current[key].pause(); return; }
        activeAudioKeyRef.current = key;
        setPlayingVoiceId(voiceId);
        setPlayingKind('browser');
      } catch { /* Browser audio is optional; leave the control ready to retry. */ }
      return;
    }
    setLoadingAudio(voiceId);
    try {
      const voice = voices.find(v => v.id === voiceId);
      if (voice?.preview_url) {
        const audio = new Audio(voice.preview_url);
        audio.onended = () => {
          if (activeAudioKeyRef.current === key) stopActive();
        };
        audio.onerror = () => generatePreview(voiceId, previewText, 'browser');
        audioElementsRef.current[key] = audio;
        await audio.play();
        if (requestId !== requestIdRef.current) { audio.pause(); return; }
        activeAudioKeyRef.current = key;
        setPlayingVoiceId(voiceId);
        setPlayingKind('browser');
        setLoadingAudio(null);
        return;
      }
      await generatePreview(voiceId, previewText, 'browser');
    } catch {
      setLoadingAudio(null);
    }
  };

  const handlePreviewWithSettings = (toast: { info: (msg: string) => void }) => {
    if (!currentVoiceId) { toast.info('No voice selected to preview'); return; }
    if (playingVoiceId === currentVoiceId && playingKind === 'sample') {
      ++requestIdRef.current;
      stopActive();
      return;
    }
    ++requestIdRef.current;
    stopActive();
    const text = getPreviewText(currentLanguage, restaurantName);
    setLoadingAudio(currentVoiceId);
    generatePreview(currentVoiceId, text, 'sample', currentSettings);
  };

  const isSamplePlaying = playingVoiceId === currentVoiceId && playingKind === 'sample';
  return { playingVoiceId, isSamplePlaying, loadingAudio, handlePlayVoice, handlePreviewWithSettings };
}
