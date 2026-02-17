/**
 * Voice & Language Settings Page
 * Post-onboarding management of AI voice, voice tuning, and language configuration.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import DashboardLayout from '../components/layout/DashboardLayout';
import Breadcrumb, { breadcrumbConfigs } from '../components/common/Breadcrumb';
import ThiingsIcon from '../components/common/ThiingsIcon';
import Spinner from '../components/common/Spinner';
import { Skeleton } from '../components/common/Skeleton';
import VoiceFilters from '../components/voice/VoiceFilters';
import VoiceGrid from '../components/voice/VoiceGrid';
import VoiceSlider from '../components/voice/VoiceSlider';
import { SUPPORTED_LANGUAGES, getPreviewText } from '../components/voice/voiceConstants';
import { DEFAULT_VOICE_SETTINGS } from '../components/voice/voiceTypes';
import type { EnhancedVoice, VoiceSettings, VoiceFiltersState } from '../components/voice/voiceTypes';
import { authFetch } from '../services/api';
import { useToast } from '../contexts/ToastContext';
import { useVoiceSettings, useSaveVoiceSettings } from '../hooks/useVoiceSettings';
import { useVoiceEngineSettings, useSaveVoiceEngine } from '../hooks/useVoiceEngineSettings';
import type { VoiceEngineSettings } from '../hooks/useVoiceEngineSettings';
import { useFeatureAccess } from '../hooks/useSubscription';
import UpgradePrompt from '../components/common/UpgradePrompt';
import Modal from '../components/common/Modal';

const OPENAI_VOICES = [
  { id: 'alloy', name: 'Alloy', description: 'Neutral and balanced' },
  { id: 'echo', name: 'Echo', description: 'Warm and engaging' },
  { id: 'fable', name: 'Fable', description: 'Expressive and dynamic' },
  { id: 'onyx', name: 'Onyx', description: 'Deep and authoritative' },
  { id: 'nova', name: 'Nova', description: 'Friendly and upbeat' },
  { id: 'shimmer', name: 'Shimmer', description: 'Clear and bright' },
] as const;

const PAGE_SIZE = 12;

export default function VoiceSettingsPage() {
  const toast = useToast();
  const { hasAccess, isLoading: isLoadingAccess } = useFeatureAccess('voice_ai');

  // Current agent config via React Query (cached 5 min)
  const { data: config, isLoading: isLoadingConfig } = useVoiceSettings();
  const saveMutation = useSaveVoiceSettings();

  // Voice engine config
  const { data: engineConfig, isLoading: isLoadingEngine } = useVoiceEngineSettings();
  const saveEngineMutation = useSaveVoiceEngine();

  // Pending changes
  const [pendingVoiceId, setPendingVoiceId] = useState<string | null>(null);
  const [pendingSettings, setPendingSettings] = useState<VoiceSettings | null>(null);
  const [pendingLanguage, setPendingLanguage] = useState<string | null>(null);
  const [pendingEngine, setPendingEngine] = useState<VoiceEngineSettings['voice_engine'] | null>(null);
  const [pendingOpenAIVoice, setPendingOpenAIVoice] = useState<string | null>(null);
  const [showEngineSwitchConfirm, setShowEngineSwitchConfirm] = useState(false);
  const [engineSwitchTarget, setEngineSwitchTarget] = useState<VoiceEngineSettings['voice_engine'] | null>(null);

  // Voice browser
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);
  const [voices, setVoices] = useState<EnhancedVoice[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [voicesSource, setVoicesSource] = useState<string>('');
  const [filters, setFilters] = useState<VoiceFiltersState>({
    gender: 'all',
    language: 'en',
    search: '',
  });

  // Audio playback
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [loadingAudio, setLoadingAudio] = useState<string | null>(null);
  const audioElementsRef = useRef<Record<string, HTMLAudioElement>>({});

  const isSaving = saveMutation.isPending || saveEngineMutation.isPending;

  const isDirty = pendingVoiceId !== null || pendingSettings !== null || pendingLanguage !== null || pendingEngine !== null || pendingOpenAIVoice !== null;

  const currentEngine = pendingEngine || engineConfig?.voice_engine || 'elevenlabs';
  const currentOpenAIVoice = pendingOpenAIVoice || engineConfig?.openai_voice_id || 'alloy';
  const currentSettings: VoiceSettings = pendingSettings || config?.voice_settings || DEFAULT_VOICE_SETTINGS;
  const currentLanguage = pendingLanguage || config?.language || 'en';
  const currentVoiceId = pendingVoiceId || config?.voice_id || '';

  // Sync filter language when config loads
  useEffect(() => {
    if (config?.language) {
      setFilters(prev => ({ ...prev, language: config.language || 'en' }));
    }
  }, [config?.language]);

  // Fetch voices for browser
  const fetchVoices = useCallback(async (pageNum: number, append: boolean) => {
    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoadingVoices(true);
    }

    const params = new URLSearchParams({
      language: filters.language,
      page_size: String(PAGE_SIZE),
      page: String(pageNum),
    });
    if (filters.gender !== 'all') params.set('gender', filters.gender);
    if (filters.search) params.set('search', filters.search);

    try {
      const response = await authFetch(`/api/elevenlabs-voices?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch voices');

      const result = await response.json();
      if (result.success && result.data.voices) {
        const newVoices: EnhancedVoice[] = result.data.voices.map((v: EnhancedVoice) => ({
          ...v,
          preview_phrase: getPreviewText(filters.language, config?.restaurant_name || undefined),
        }));

        if (append) {
          setVoices(prev => [...prev, ...newVoices]);
        } else {
          setVoices(newVoices);
        }
        setHasMore(result.data.has_more || false);
        setVoicesSource(result.data.source || '');
      }
    } catch (error) {
      console.error('Error fetching voices:', error);
    } finally {
      setIsLoadingVoices(false);
      setIsLoadingMore(false);
    }
  }, [filters, config?.restaurant_name]);

  // Refetch voices when filters change
  useEffect(() => {
    if (isBrowserOpen) {
      setPage(0);
      fetchVoices(0, false);
    }
  }, [filters.gender, filters.language, filters.search, isBrowserOpen]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchVoices(nextPage, true);
  };

  // Audio playback
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

  // Voice selection from browser
  const handleSelectVoice = (voiceId: string) => {
    setPendingVoiceId(voiceId);
  };

  // Settings change
  const handleSettingChange = (key: keyof VoiceSettings, value: number) => {
    const newSettings = { ...currentSettings, [key]: value };
    setPendingSettings(newSettings);
  };

  // Reset settings to defaults
  const handleResetSettings = () => {
    setPendingSettings({ ...DEFAULT_VOICE_SETTINGS });
  };

  // Preview with current settings
  const handlePreviewWithSettings = () => {
    const voiceId = currentVoiceId;
    if (!voiceId) {
      toast.info('No voice selected to preview');
      return;
    }
    const text = getPreviewText(currentLanguage, config?.restaurant_name || undefined);
    // Clear cached audio for this voice to force re-generation with new settings
    delete audioElementsRef.current[voiceId];
    setLoadingAudio(voiceId);
    generatePreview(voiceId, text, currentSettings);
  };

  // Language change
  const handleLanguageChange = (lang: string) => {
    setPendingLanguage(lang);
  };

  // Engine switch confirmation
  const handleEngineSwitch = (target: VoiceEngineSettings['voice_engine']) => {
    if (target === currentEngine) return;
    setEngineSwitchTarget(target);
    setShowEngineSwitchConfirm(true);
  };

  const confirmEngineSwitch = () => {
    if (engineSwitchTarget) {
      setPendingEngine(engineSwitchTarget);
    }
    setShowEngineSwitchConfirm(false);
    setEngineSwitchTarget(null);
  };

  // Save all changes via React Query mutation
  const handleSave = () => {
    const hasElevenLabsChanges = pendingVoiceId !== null || pendingSettings !== null || pendingLanguage !== null;
    const hasEngineChanges = pendingEngine !== null || pendingOpenAIVoice !== null;

    let completedCalls = 0;
    const expectedCalls = (hasElevenLabsChanges ? 1 : 0) + (hasEngineChanges ? 1 : 0);

    if (expectedCalls === 0) return;

    const onCallComplete = () => {
      completedCalls++;
      if (completedCalls >= expectedCalls) {
        toast.success('Voice settings saved successfully');
        setPendingVoiceId(null);
        setPendingSettings(null);
        setPendingLanguage(null);
        setPendingEngine(null);
        setPendingOpenAIVoice(null);
      }
    };

    if (hasElevenLabsChanges) {
      const body: Record<string, unknown> = {};
      if (pendingVoiceId) body.voice_id = pendingVoiceId;
      if (pendingSettings) body.voice_settings = pendingSettings;
      if (pendingLanguage) body.language = pendingLanguage;

      saveMutation.mutate(body, {
        onSuccess: onCallComplete,
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : 'Failed to save voice settings');
        },
      });
    }

    if (hasEngineChanges) {
      const engineBody: Partial<Pick<VoiceEngineSettings, 'voice_engine' | 'openai_voice_id'>> = {};
      if (pendingEngine) engineBody.voice_engine = pendingEngine;
      if (pendingOpenAIVoice) engineBody.openai_voice_id = pendingOpenAIVoice;

      saveEngineMutation.mutate(engineBody, {
        onSuccess: onCallComplete,
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : 'Failed to save engine settings');
        },
      });
    }
  };

  // Loading state - skeleton layout
  // Gate Voice AI to Growth+ plans
  if (!isLoadingAccess && !hasAccess) {
    return (
      <UpgradePrompt
        requiredPlan="growth"
        feature="Voice AI Agent"
        description="Configure your AI voice agent to handle phone reservations automatically. Available on Growth and Scale plans."
      />
    );
  }

  if (isLoadingConfig || isLoadingAccess || isLoadingEngine) {
    return (
      <DashboardLayout>
        <div className="p-6 lg:p-8 max-w-5xl" role="status" aria-label="Loading voice settings">
          <Skeleton className="h-4 w-48 mb-2" />
          <Skeleton className="h-8 w-64 mb-1" />
          <Skeleton className="h-4 w-80 mb-6" />
          <div className="space-y-6">
            <div className="bg-white border border-[#E7E5E4]/50 rounded-xl p-6 shadow-sm">
              <Skeleton className="h-5 w-32 mb-4" />
              <div className="flex items-center justify-between">
                <div>
                  <Skeleton className="h-5 w-40 mb-2" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="h-10 w-32 rounded-lg" />
              </div>
            </div>
            <div className="bg-white border border-[#E7E5E4]/50 rounded-xl p-6 shadow-sm">
              <Skeleton className="h-5 w-28 mb-4" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-2 w-full rounded-full" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // No agent configured
  if (!config?.agent_id) {
    return (
      <DashboardLayout>
        <div className="p-6 lg:p-8">
          <Breadcrumb items={breadcrumbConfigs.voiceSettings} />
          <div className="mt-8 text-center py-16">
            <div className="bg-[#9F1239]/5 border border-[#9F1239]/20 rounded-xl p-8 max-w-md mx-auto">
              <ThiingsIcon name="volume" pxSize={48} className="mx-auto mb-4" />
              <h2 className="text-lg font-bold text-[#1C1917] mb-2">No AI Agent Configured</h2>
              <p className="text-sm text-[#57534E]">
                Complete the onboarding process to set up your AI voice agent, then return here to customize voice settings.
              </p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const selectedBrowserVoice = voices.find(v => v.id === pendingVoiceId);

  return (
    <DashboardLayout>
      <div className="dashboard p-6 lg:p-8 max-w-5xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <Breadcrumb items={breadcrumbConfigs.voiceSettings} className="mb-2" />
            <h1 className="text-2xl font-bold text-[#1C1917] tracking-tight">
              Voice & Language Settings
            </h1>
            <p className="text-sm text-[#57534E] mt-1">
              Customize your AI agent's voice, tuning, and language.
            </p>
          </div>
          <button
            onClick={handleSave}
            disabled={!isDirty || isSaving}
            className="px-6 py-2.5 bg-[#9F1239] hover:bg-[#881337] text-white font-semibold rounded-xl shadow-sm shadow-[#9F1239]/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 self-start sm:self-auto"
          >
            {isSaving ? <Spinner size="sm" className="border-white border-t-white/30" /> : null}
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

        <div className="space-y-6">
          {/* Voice Engine Selector */}
          <section className="bg-white border border-[#E7E5E4]/50 rounded-xl p-6 shadow-sm">
            <h2 className="text-lg font-bold text-[#1C1917] mb-4 flex items-center gap-2">
              <ThiingsIcon name="settings" pxSize={20} />
              Voice Engine
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* ElevenLabs Card */}
              <button
                type="button"
                onClick={() => handleEngineSwitch('elevenlabs')}
                className={`text-left p-4 rounded-xl border-2 transition-all ${
                  currentEngine === 'elevenlabs'
                    ? 'border-[#9F1239] bg-[#9F1239]/5'
                    : 'border-[#E7E5E4]/50 hover:border-[#A8A29E]'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-base font-semibold text-[#1C1917]">ElevenLabs</span>
                  {currentEngine === 'elevenlabs' && (
                    <span className="text-xs font-medium text-[#9F1239] bg-[#9F1239]/10 px-2 py-0.5 rounded-full">
                      Current
                    </span>
                  )}
                </div>
                <p className="text-sm text-[#57534E]">
                  Managed voice agent with premium voice quality, voice cloning, and multilingual support.
                </p>
              </button>

              {/* OpenAI Realtime Card */}
              <button
                type="button"
                onClick={() => handleEngineSwitch('openai_realtime')}
                className={`text-left p-4 rounded-xl border-2 transition-all ${
                  currentEngine === 'openai_realtime'
                    ? 'border-[#9F1239] bg-[#9F1239]/5'
                    : 'border-[#E7E5E4]/50 hover:border-[#A8A29E]'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-base font-semibold text-[#1C1917]">OpenAI Realtime</span>
                  {currentEngine === 'openai_realtime' && (
                    <span className="text-xs font-medium text-[#9F1239] bg-[#9F1239]/10 px-2 py-0.5 rounded-full">
                      Current
                    </span>
                  )}
                </div>
                <p className="text-sm text-[#57534E]">
                  Lower cost, native tool calling with WebSocket-based real-time voice.
                </p>
              </button>
            </div>

            {pendingEngine && (
              <p className="mt-3 text-xs text-[#d97706] bg-[#d97706]/10 rounded-lg px-3 py-2">
                Engine change pending. Click "Save Changes" to apply.
              </p>
            )}

            {engineConfig?.voice_engine_status && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs text-[#A8A29E]">Status:</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  engineConfig.voice_engine_status === 'active'
                    ? 'text-emerald-700 bg-emerald-50'
                    : engineConfig.voice_engine_status === 'testing'
                    ? 'text-amber-700 bg-amber-50'
                    : 'text-stone-500 bg-stone-100'
                }`}>
                  {engineConfig.voice_engine_status.charAt(0).toUpperCase() + engineConfig.voice_engine_status.slice(1)}
                </span>
              </div>
            )}
          </section>

          {/* ElevenLabs-specific sections */}
          {currentEngine === 'elevenlabs' && (
            <>
              {/* Section 1: Current Voice */}
              <section className="bg-white border border-[#E7E5E4]/50 rounded-xl p-6 shadow-sm">
                <h2 className="text-lg font-bold text-[#1C1917] mb-4 flex items-center gap-2">
                  <ThiingsIcon name="volume" pxSize={20} />
                  Current Voice
                </h2>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-[#1C1917]">
                      {pendingVoiceId ? (
                        <span>
                          {selectedBrowserVoice?.name || pendingVoiceId}
                          <span className="ml-2 text-xs font-normal text-[#d97706] bg-[#d97706]/10 px-2 py-0.5 rounded-full">
                            pending
                          </span>
                        </span>
                      ) : (
                        config.voice_id || 'No voice set'
                      )}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-sm text-[#57534E]">
                      <span className="capitalize">{selectedBrowserVoice?.gender || '—'}</span>
                      <span>-</span>
                      <span>{currentLanguage.toUpperCase()}</span>
                      {selectedBrowserVoice?.accent && (
                        <>
                          <span>-</span>
                          <span>{selectedBrowserVoice.accent}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {currentVoiceId && (
                      <button
                        onClick={() => {
                          const text = getPreviewText(currentLanguage, config.restaurant_name || undefined);
                          handlePlayVoice(currentVoiceId, text);
                        }}
                        disabled={loadingAudio === currentVoiceId}
                        className="px-4 py-2 text-sm font-medium bg-[#F5F5F4] hover:bg-[#E7E5E4] rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                      >
                        {loadingAudio === currentVoiceId ? (
                          <Spinner size="sm" />
                        ) : playingVoiceId === currentVoiceId ? (
                          <ThiingsIcon name="pause" pxSize={16} />
                        ) : (
                          <ThiingsIcon name="play" pxSize={16} />
                        )}
                        Preview
                      </button>
                    )}
                    <button
                      onClick={() => setIsBrowserOpen(!isBrowserOpen)}
                      className="px-4 py-2 text-sm font-medium text-[#9F1239] bg-[#9F1239]/5 hover:bg-[#9F1239]/10 rounded-lg transition-colors"
                    >
                      {isBrowserOpen ? 'Hide Voice Browser' : 'Change Voice'}
                    </button>
                  </div>
                </div>
              </section>

              {/* Section 2: Voice Settings */}
              <section className="bg-white border border-[#E7E5E4]/50 rounded-xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-[#1C1917] flex items-center gap-2">
                    <ThiingsIcon name="settings" pxSize={20} />
                    Voice Tuning
                  </h2>
                  <button
                    onClick={handleResetSettings}
                    className="text-xs text-[#9F1239] hover:underline"
                  >
                    Reset to defaults
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <VoiceSlider
                    label="Stability"
                    value={currentSettings.stability}
                    min={0}
                    max={1}
                    step={0.05}
                    lowLabel="Variable"
                    highLabel="Stable"
                    onChange={(v) => handleSettingChange('stability', v)}
                  />
                  <VoiceSlider
                    label="Similarity Boost"
                    value={currentSettings.similarity_boost}
                    min={0}
                    max={1}
                    step={0.05}
                    lowLabel="Low"
                    highLabel="High"
                    onChange={(v) => handleSettingChange('similarity_boost', v)}
                  />
                  <VoiceSlider
                    label="Style"
                    value={currentSettings.style}
                    min={0}
                    max={1}
                    step={0.05}
                    lowLabel="None"
                    highLabel="Expressive"
                    onChange={(v) => handleSettingChange('style', v)}
                  />
                  <VoiceSlider
                    label="Speed"
                    value={currentSettings.speed}
                    min={0.7}
                    max={1.2}
                    step={0.05}
                    lowLabel="Slow"
                    highLabel="Fast"
                    formatValue={(v) => `${v.toFixed(2)}x`}
                    onChange={(v) => handleSettingChange('speed', v)}
                  />
                </div>

                <div className="mt-4 pt-4 border-t border-[#E7E5E4]/50">
                  <button
                    onClick={handlePreviewWithSettings}
                    disabled={!currentVoiceId || loadingAudio !== null}
                    className="px-5 py-2.5 text-sm font-medium bg-[#F5F5F4] hover:bg-[#E7E5E4] rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    {loadingAudio ? <Spinner size="sm" /> : <ThiingsIcon name="play" pxSize={16} />}
                    Preview with settings
                  </button>
                </div>
              </section>

              {/* Section 3: Voice Browser (collapsible) */}
              {isBrowserOpen && (
                <section className="bg-white border border-[#E7E5E4]/50 rounded-xl p-6 shadow-sm">
                  <h2 className="text-lg font-bold text-[#1C1917] mb-4 flex items-center gap-2">
                    <ThiingsIcon name="search" pxSize={20} />
                    Voice Library
                  </h2>

                  <VoiceFilters
                    filters={filters}
                    onChange={setFilters}
                    defaultLanguage={currentLanguage}
                    hideSearch={voicesSource === 'own_voices_fallback'}
                  />

                  <VoiceGrid
                    voices={voices}
                    selectedVoiceId={pendingVoiceId || config.voice_id || ''}
                    playingVoiceId={playingVoiceId}
                    loadingAudioId={loadingAudio}
                    hasMore={hasMore}
                    isLoadingMore={isLoadingMore}
                    onSelectVoice={handleSelectVoice}
                    onPlayVoice={handlePlayVoice}
                    onLoadMore={handleLoadMore}
                    isLoading={isLoadingVoices}
                    source={voicesSource}
                  />
                </section>
              )}

              {/* Section 4: Language Settings */}
              <section className="bg-white border border-[#E7E5E4]/50 rounded-xl p-6 shadow-sm">
                <h2 className="text-lg font-bold text-[#1C1917] mb-4 flex items-center gap-2">
                  <ThiingsIcon name="globe" pxSize={20} />
                  Language
                </h2>

                <div className="max-w-xs">
                  <select
                    value={currentLanguage}
                    onChange={(e) => handleLanguageChange(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border border-[#E7E5E4]/50 rounded-xl bg-white text-[#1C1917] focus:outline-none focus:ring-2 focus:ring-[#9F1239]/50"
                  >
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.flag} {lang.label}
                      </option>
                    ))}
                  </select>
                </div>

                {pendingLanguage && pendingLanguage !== config?.language && (
                  <p className="mt-3 text-xs text-[#d97706] bg-[#d97706]/10 rounded-lg px-3 py-2">
                    Changing the language will update your agent's greeting message. The voice will speak in the selected language using its multilingual capabilities.
                  </p>
                )}
              </section>

              {/* Section 5: Agent Info (read-only) */}
              <section className="bg-white border border-[#E7E5E4]/50 rounded-xl p-6 shadow-sm">
                <h2 className="text-lg font-bold text-[#1C1917] mb-4 flex items-center gap-2">
                  <ThiingsIcon name="info" pxSize={20} />
                  Agent Info
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-[#A8A29E] text-xs mb-1">Voice Engine</p>
                    <p className="text-[#1C1917] font-mono">turbo_v2.5</p>
                  </div>
                  <div>
                    <p className="text-[#A8A29E] text-xs mb-1">Agent ID</p>
                    <div className="flex items-center gap-2">
                      <p className="text-[#1C1917] font-mono truncate">{config.agent_id}</p>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(config.agent_id);
                          toast.info('Agent ID copied');
                        }}
                        className="text-[#9F1239] hover:text-[#881337] flex-shrink-0"
                        title="Copy Agent ID"
                      >
                        <ThiingsIcon name="clipboard" pxSize={14} />
                      </button>
                    </div>
                  </div>
                  {config.agent_updated_at && (
                    <div>
                      <p className="text-[#A8A29E] text-xs mb-1">Last Updated</p>
                      <p className="text-[#1C1917]">
                        {new Date(config.agent_updated_at).toLocaleString()}
                      </p>
                    </div>
                  )}
                  {config.created_at && (
                    <div>
                      <p className="text-[#A8A29E] text-xs mb-1">Created</p>
                      <p className="text-[#1C1917]">
                        {new Date(config.created_at).toLocaleString()}
                      </p>
                    </div>
                  )}
                </div>
              </section>
            </>
          )}

          {/* OpenAI Realtime-specific sections */}
          {currentEngine === 'openai_realtime' && (
            <>
              {/* OpenAI Voice Picker */}
              <section className="bg-white border border-[#E7E5E4]/50 rounded-xl p-6 shadow-sm">
                <h2 className="text-lg font-bold text-[#1C1917] mb-4 flex items-center gap-2">
                  <ThiingsIcon name="volume" pxSize={20} />
                  OpenAI Voice
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {OPENAI_VOICES.map((voice) => (
                    <button
                      key={voice.id}
                      type="button"
                      onClick={() => setPendingOpenAIVoice(voice.id)}
                      className={`text-left p-4 rounded-xl border-2 transition-all ${
                        currentOpenAIVoice === voice.id
                          ? 'border-[#9F1239] bg-[#9F1239]/5'
                          : 'border-[#E7E5E4]/50 hover:border-[#A8A29E]'
                      }`}
                    >
                      <p className="text-sm font-semibold text-[#1C1917]">{voice.name}</p>
                      <p className="text-xs text-[#57534E] mt-1">{voice.description}</p>
                      {currentOpenAIVoice === voice.id && (
                        <span className="inline-block mt-2 text-xs font-medium text-[#9F1239]">
                          Selected
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {pendingOpenAIVoice && pendingOpenAIVoice !== engineConfig?.openai_voice_id && (
                  <p className="mt-3 text-xs text-[#d97706] bg-[#d97706]/10 rounded-lg px-3 py-2">
                    Voice change pending. Click "Save Changes" to apply.
                  </p>
                )}
              </section>

              {/* Engine Info (read-only) */}
              <section className="bg-white border border-[#E7E5E4]/50 rounded-xl p-6 shadow-sm">
                <h2 className="text-lg font-bold text-[#1C1917] mb-4 flex items-center gap-2">
                  <ThiingsIcon name="info" pxSize={20} />
                  Engine Info
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-[#A8A29E] text-xs mb-1">Engine</p>
                    <p className="text-[#1C1917] font-mono">OpenAI Realtime API</p>
                  </div>
                  <div>
                    <p className="text-[#A8A29E] text-xs mb-1">WebSocket Endpoint</p>
                    <p className="text-[#1C1917] font-mono truncate">seatable-voice.fly.dev</p>
                  </div>
                  <div>
                    <p className="text-[#A8A29E] text-xs mb-1">Status</p>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      engineConfig?.voice_engine_status === 'active'
                        ? 'text-emerald-700 bg-emerald-50'
                        : engineConfig?.voice_engine_status === 'testing'
                        ? 'text-amber-700 bg-amber-50'
                        : 'text-stone-500 bg-stone-100'
                    }`}>
                      {(engineConfig?.voice_engine_status || 'active').charAt(0).toUpperCase() + (engineConfig?.voice_engine_status || 'active').slice(1)}
                    </span>
                  </div>
                  <div>
                    <p className="text-[#A8A29E] text-xs mb-1">Voice</p>
                    <p className="text-[#1C1917] font-mono">{currentOpenAIVoice}</p>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>

        {/* Engine Switch Confirmation Modal */}
        <Modal
          isOpen={showEngineSwitchConfirm}
          onClose={() => setShowEngineSwitchConfirm(false)}
          title="Switch Voice Engine?"
          size="sm"
        >
          <p className="text-sm text-[#57534E] mb-6">
            Are you sure you want to switch to{' '}
            <span className="font-semibold text-[#1C1917]">
              {engineSwitchTarget === 'openai_realtime' ? 'OpenAI Realtime' : 'ElevenLabs'}
            </span>
            ? This will change how incoming calls are handled.
          </p>
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => setShowEngineSwitchConfirm(false)}
              className="px-4 py-2 text-sm font-medium text-[#57534E] hover:text-[#1C1917] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={confirmEngineSwitch}
              className="px-5 py-2 text-sm font-semibold bg-[#9F1239] hover:bg-[#881337] text-white rounded-xl transition-colors"
            >
              Switch Engine
            </button>
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
}
