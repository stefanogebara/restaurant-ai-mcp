import { useState, useRef, useEffect } from 'react';
import { authFetch } from '../services/api';
import { getPreviewText } from '../components/voice/voiceConstants';
import type { EnhancedVoice, VoiceSettings } from '../components/voice/voiceTypes';

interface UseAudioPlaybackOptions {
  voices: EnhancedVoice[];
  currentVoiceId: string;
  currentLanguage: string;
  restaurantName?: string;
  currentSettings: VoiceSettings;
  sampleText?: string;
}

export function useAudioPlayback({ voices, currentVoiceId, currentLanguage, restaurantName, currentSettings, sampleText }: UseAudioPlaybackOptions) {
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [playingKind, setPlayingKind] = useState<'browser' | 'sample' | null>(null);
  const [loadingAudio, setLoadingAudio] = useState<string | null>(null);
  const [sampleDuration, setSampleDuration] = useState(0);
  const [sampleCurrentTime, setSampleCurrentTime] = useState(0);
  const audioElementsRef = useRef<Record<string, HTMLAudioElement>>({});
  const sampleSignatureRef = useRef<string | null>(null);
  const sampleAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeAudioKeyRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);
  const sampleContextSignature = JSON.stringify({
    voiceId: currentVoiceId,
    language: currentLanguage,
    text: sampleText ?? getPreviewText(currentLanguage, restaurantName),
    settings: currentSettings,
  });
  const previousContextRef = useRef(sampleContextSignature);

  useEffect(() => {
    if (previousContextRef.current === sampleContextSignature) return;
    previousContextRef.current = sampleContextSignature;
    ++requestIdRef.current;
    if (activeAudioKeyRef.current?.startsWith('sample:')) {
      sampleAudioRef.current?.pause();
      activeAudioKeyRef.current = null;
      setPlayingVoiceId(null);
      setPlayingKind(null);
    }
    sampleAudioRef.current = null;
    sampleSignatureRef.current = null;
    setLoadingAudio(null);
    setSampleDuration(0);
    setSampleCurrentTime(0);
  }, [sampleContextSignature]);

  const stopActive = () => {
    const key = activeAudioKeyRef.current;
    if (key) audioElementsRef.current[key]?.pause();
    activeAudioKeyRef.current = null;
    setPlayingVoiceId(null);
    setPlayingKind(null);
  };

  const generatePreview = async (voiceId: string, text: string, kind: 'browser' | 'sample', settings?: VoiceSettings, signature?: string, onError?: () => void) => {
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
        if (kind === 'sample') {
          sampleSignatureRef.current = signature || null;
          sampleAudioRef.current = audio;
          setSampleDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
          setSampleCurrentTime(0);
          audio.onloadedmetadata = () => {
            if (sampleAudioRef.current === audio) setSampleDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
          };
          audio.ontimeupdate = () => {
            if (sampleAudioRef.current === audio) setSampleCurrentTime(audio.currentTime);
          };
        }
        audio.onended = () => {
          if (kind === 'sample' && sampleAudioRef.current === audio) setSampleCurrentTime(Number.isFinite(audio.duration) ? audio.duration : 0);
          if (activeAudioKeyRef.current === key) stopActive();
        };
        audioElementsRef.current[key] = audio;
        await audio.play();
        if (requestId !== requestIdRef.current) { audio.pause(); return; }
        activeAudioKeyRef.current = key;
        setPlayingVoiceId(voiceId);
        setPlayingKind(kind);
      } else if (kind === 'sample') {
        onError?.();
      }
    } catch (error) {
      console.error('Preview error:', error);
      if (kind === 'sample') onError?.();
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

  const handlePreviewWithSettings = async (toast: { info: (msg: string) => void; error?: (msg: string) => void }, sampleText?: string) => {
    if (!currentVoiceId) { toast.info('No voice selected to preview'); return; }
    if (playingVoiceId === currentVoiceId && playingKind === 'sample') {
      ++requestIdRef.current;
      stopActive();
      return;
    }
    const text = sampleText === undefined ? getPreviewText(currentLanguage, restaurantName) : sampleText.trim();
    if (!text) { toast.info('Enter a greeting to preview'); return; }
    const signature = JSON.stringify({ voiceId: currentVoiceId, language: currentLanguage, text, settings: currentSettings });
    const requestId = ++requestIdRef.current;
    stopActive();
    if (sampleSignatureRef.current === signature && sampleAudioRef.current) {
      const audio = sampleAudioRef.current;
      if (audio.ended || (Number.isFinite(audio.duration) && audio.currentTime >= audio.duration)) {
        audio.currentTime = 0;
        setSampleCurrentTime(0);
      }
      try {
        await audio.play();
        if (requestId !== requestIdRef.current) { audio.pause(); return; }
        activeAudioKeyRef.current = `sample:${currentVoiceId}`;
        setPlayingVoiceId(currentVoiceId);
        setPlayingKind('sample');
      } catch {
        toast.error?.('Could not play this sample. Please try again.');
      }
      return;
    }
    setLoadingAudio(currentVoiceId);
    await generatePreview(currentVoiceId, text, 'sample', currentSettings, signature, () => toast.error?.('Could not generate this sample. Please try again.'));
  };

  const seekSample = (fraction: number) => {
    const audio = sampleAudioRef.current;
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    audio.currentTime = Math.max(0, Math.min(1, fraction)) * audio.duration;
    setSampleCurrentTime(audio.currentTime);
  };

  const isSamplePlaying = playingVoiceId === currentVoiceId && playingKind === 'sample';
  return { playingVoiceId, isSamplePlaying, loadingAudio, sampleDuration, sampleCurrentTime, seekSample, handlePlayVoice, handlePreviewWithSettings };
}
