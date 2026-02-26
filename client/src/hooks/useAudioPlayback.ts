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
  const [loadingAudio, setLoadingAudio] = useState<string | null>(null);
  const audioElementsRef = useRef<Record<string, HTMLAudioElement>>({});

  const generatePreview = async (voiceId: string, text: string, settings?: VoiceSettings) => {
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
      if (result.success && result.data.audio) {
        const audio = new Audio(result.data.audio);
        audio.onended = () => setPlayingVoiceId(null);
        audioElementsRef.current[voiceId] = audio;
        await audio.play();
        setPlayingVoiceId(voiceId);
      }
    } catch (error) {
      console.error('Preview error:', error);
    } finally {
      setLoadingAudio(null);
    }
  };

  const handlePlayVoice = async (voiceId: string, previewText: string) => {
    if (playingVoiceId === voiceId) {
      audioElementsRef.current[voiceId]?.pause();
      setPlayingVoiceId(null);
      return;
    }
    if (playingVoiceId && audioElementsRef.current[playingVoiceId]) {
      audioElementsRef.current[playingVoiceId].pause();
    }
    if (audioElementsRef.current[voiceId]) {
      audioElementsRef.current[voiceId].currentTime = 0;
      audioElementsRef.current[voiceId].play();
      setPlayingVoiceId(voiceId);
      return;
    }
    setLoadingAudio(voiceId);
    try {
      const voice = voices.find(v => v.id === voiceId);
      if (voice?.preview_url) {
        const audio = new Audio(voice.preview_url);
        audio.onended = () => setPlayingVoiceId(null);
        audio.onerror = () => generatePreview(voiceId, previewText);
        audioElementsRef.current[voiceId] = audio;
        await audio.play();
        setPlayingVoiceId(voiceId);
        setLoadingAudio(null);
        return;
      }
      await generatePreview(voiceId, previewText);
    } catch {
      setLoadingAudio(null);
    }
  };

  const handlePreviewWithSettings = (toast: { info: (msg: string) => void }) => {
    if (!currentVoiceId) { toast.info('No voice selected to preview'); return; }
    const text = getPreviewText(currentLanguage, restaurantName);
    delete audioElementsRef.current[currentVoiceId];
    setLoadingAudio(currentVoiceId);
    generatePreview(currentVoiceId, text, currentSettings);
  };

  return { playingVoiceId, loadingAudio, handlePlayVoice, handlePreviewWithSettings };
}
