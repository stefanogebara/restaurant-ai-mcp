/**
 * Voice & Language Settings Page
 *
 * Orchestrator page — manages state and data fetching.
 * UI is delegated to focused subcomponents in components/voice/.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import DashboardLayout from '../components/layout/DashboardLayout';
import { Skeleton } from '../components/common/Skeleton';
import { authFetch } from '../services/api';
import { useToast } from '../contexts/ToastContext';
import { useVoiceSettings, useSaveVoiceSettings } from '../hooks/useVoiceSettings';
import { useVoiceEngineSettings, useSaveVoiceEngine } from '../hooks/useVoiceEngineSettings';
import type { VoiceEngineSettings } from '../hooks/useVoiceEngineSettings';
import { useFeatureAccess } from '../hooks/useSubscription';
import UpgradePrompt from '../components/common/UpgradePrompt';
import ThiingsIcon from '../components/common/ThiingsIcon';

import VoiceEngineSelector from '../components/voice/VoiceEngineSelector';
import VoiceCurrentCard from '../components/voice/VoiceCurrentCard';
import VoiceTuningPanel from '../components/voice/VoiceTuningPanel';
import VoiceLanguagePicker from '../components/voice/VoiceLanguagePicker';
import VoiceAgentInfo from '../components/voice/VoiceAgentInfo';
import OpenAIVoicePicker from '../components/voice/OpenAIVoicePicker';
import OpenAIEngineInfo from '../components/voice/OpenAIEngineInfo';
import VoiceEngineSwitchModal from '../components/voice/VoiceEngineSwitchModal';
import VoiceFilters from '../components/voice/VoiceFilters';
import VoiceGrid from '../components/voice/VoiceGrid';
import Spinner from '../components/common/Spinner';

import { getPreviewText } from '../components/voice/voiceConstants';
import { DEFAULT_VOICE_SETTINGS } from '../components/voice/voiceTypes';
import type { EnhancedVoice, VoiceSettings, VoiceFiltersState } from '../components/voice/voiceTypes';

const PAGE_SIZE = 12;

export default function VoiceSettingsPage() {
  const toast = useToast();
  const { hasAccess, isLoading: isLoadingAccess } = useFeatureAccess('voice_ai');

  const { data: config, isLoading: isLoadingConfig } = useVoiceSettings();
  const saveMutation = useSaveVoiceSettings();
  const { data: engineConfig } = useVoiceEngineSettings();
  const saveEngineMutation = useSaveVoiceEngine();

  // ─── Pending changes ──────────────────────────────────────────────────────────

  const [pendingVoiceId, setPendingVoiceId] = useState<string | null>(null);
  const [pendingSettings, setPendingSettings] = useState<VoiceSettings | null>(null);
  const [pendingLanguage, setPendingLanguage] = useState<string | null>(null);
  const [pendingEngine, setPendingEngine] = useState<VoiceEngineSettings['voice_engine'] | null>(null);
  const [pendingOpenAIVoice, setPendingOpenAIVoice] = useState<string | null>(null);
  const [showEngineSwitchConfirm, setShowEngineSwitchConfirm] = useState(false);
  const [engineSwitchTarget, setEngineSwitchTarget] = useState<VoiceEngineSettings['voice_engine'] | null>(null);

  // ─── Voice browser ────────────────────────────────────────────────────────────

  const [isBrowserOpen, setIsBrowserOpen] = useState(false);
  const [voices, setVoices] = useState<EnhancedVoice[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [voicesSource, setVoicesSource] = useState<string>('');
  const [filters, setFilters] = useState<VoiceFiltersState>({ gender: 'all', language: 'en', search: '' });

  // ─── Audio playback ───────────────────────────────────────────────────────────

  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [loadingAudio, setLoadingAudio] = useState<string | null>(null);
  const audioElementsRef = useRef<Record<string, HTMLAudioElement>>({});

  // ─── Derived state ────────────────────────────────────────────────────────────

  const isSaving = saveMutation.isPending || saveEngineMutation.isPending;
  const isDirty = pendingVoiceId !== null || pendingSettings !== null || pendingLanguage !== null || pendingEngine !== null || pendingOpenAIVoice !== null;

  const currentEngine = pendingEngine || engineConfig?.voice_engine || 'elevenlabs';
  const currentOpenAIVoice = pendingOpenAIVoice || engineConfig?.openai_voice_id || 'alloy';
  const currentSettings: VoiceSettings = pendingSettings || config?.voice_settings || DEFAULT_VOICE_SETTINGS;
  const currentLanguage = pendingLanguage || config?.language || 'en';
  const currentVoiceId = pendingVoiceId || config?.voice_id || '';
  const selectedBrowserVoice = voices.find(v => v.id === pendingVoiceId);

  // Sync filter language when config loads
  useEffect(() => {
    if (config?.language) setFilters(prev => ({ ...prev, language: config.language || 'en' }));
  }, [config?.language]);

  // ─── Voice browser fetching ───────────────────────────────────────────────────

  const fetchVoices = useCallback(async (pageNum: number, append: boolean) => {
    if (append) setIsLoadingMore(true); else setIsLoadingVoices(true);

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
        if (append) setVoices(prev => [...prev, ...newVoices]); else setVoices(newVoices);
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

  useEffect(() => {
    if (isBrowserOpen) { setPage(0); fetchVoices(0, false); }
  }, [filters.gender, filters.language, filters.search, isBrowserOpen]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchVoices(nextPage, true);
  };

  // ─── Audio playback ───────────────────────────────────────────────────────────

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

  const handlePreviewWithSettings = () => {
    if (!currentVoiceId) { toast.info('No voice selected to preview'); return; }
    const text = getPreviewText(currentLanguage, config?.restaurant_name || undefined);
    delete audioElementsRef.current[currentVoiceId];
    setLoadingAudio(currentVoiceId);
    generatePreview(currentVoiceId, text, currentSettings);
  };

  // ─── Handlers ─────────────────────────────────────────────────────────────────

  const handleSettingChange = (key: keyof VoiceSettings, value: number) => {
    setPendingSettings({ ...currentSettings, [key]: value });
  };

  const handleEngineSwitch = (target: VoiceEngineSettings['voice_engine']) => {
    if (target === currentEngine) return;
    setEngineSwitchTarget(target);
    setShowEngineSwitchConfirm(true);
  };

  const confirmEngineSwitch = () => {
    if (engineSwitchTarget) setPendingEngine(engineSwitchTarget);
    setShowEngineSwitchConfirm(false);
    setEngineSwitchTarget(null);
  };

  const handleSave = () => {
    const hasElevenLabsChanges = pendingVoiceId !== null || pendingSettings !== null || pendingLanguage !== null;
    const hasEngineChanges = pendingEngine !== null || pendingOpenAIVoice !== null;
    const expectedCalls = (hasElevenLabsChanges ? 1 : 0) + (hasEngineChanges ? 1 : 0);
    if (expectedCalls === 0) return;

    let completedCalls = 0;
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
      if (pendingVoiceId && selectedBrowserVoice?.name) body.voice_name = selectedBrowserVoice.name;
      if (pendingSettings) body.voice_settings = pendingSettings;
      if (pendingLanguage) body.language = pendingLanguage;
      saveMutation.mutate(body, {
        onSuccess: onCallComplete,
        onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to save voice settings'),
      });
    }

    if (hasEngineChanges) {
      const engineBody: Partial<Pick<VoiceEngineSettings, 'voice_engine' | 'openai_voice_id'>> = {};
      if (pendingEngine) engineBody.voice_engine = pendingEngine;
      if (pendingOpenAIVoice) engineBody.openai_voice_id = pendingOpenAIVoice;
      saveEngineMutation.mutate(engineBody, {
        onSuccess: onCallComplete,
        onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to save engine settings'),
      });
    }
  };

  // ─── Early returns ────────────────────────────────────────────────────────────

  if (!isLoadingAccess && !hasAccess) {
    return (
      <UpgradePrompt
        requiredPlan="growth"
        feature="Voice AI Agent"
        description="Configure your AI voice agent to handle phone reservations automatically. Available on Growth and Scale plans."
      />
    );
  }

  if (isLoadingConfig || isLoadingAccess) {
    return (
      <DashboardLayout>
        <div className="p-6 lg:p-8 max-w-5xl" role="status" aria-label="Loading voice settings">
          <Skeleton className="h-4 w-48 mb-2" />
          <Skeleton className="h-8 w-64 mb-1" />
          <Skeleton className="h-4 w-80 mb-6" />
          <div className="space-y-6">
            <div className="bg-white border border-border-gray rounded-2xl p-6">
              <Skeleton className="h-5 w-32 mb-4" />
              <div className="flex items-center justify-between">
                <div><Skeleton className="h-5 w-40 mb-2" /><Skeleton className="h-4 w-24" /></div>
                <Skeleton className="h-10 w-32 rounded-lg" />
              </div>
            </div>
            <div className="bg-white border border-border-gray rounded-2xl p-6">
              <Skeleton className="h-5 w-28 mb-4" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-24" /><Skeleton className="h-2 w-full rounded-full" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!config?.agent_id) {
    return (
      <DashboardLayout>
        <div className="p-6 lg:p-8">
          <div className="mt-8 text-center py-16">
            <div className="bg-burgundy/5 border border-burgundy/20 rounded-2xl p-8 max-w-md mx-auto">
              <ThiingsIcon name="volume" pxSize={48} className="mx-auto mb-4" />
              <h2 className="text-lg font-bold text-deep-charcoal mb-2">No AI Agent Configured</h2>
              <p className="text-sm text-stone-gray">
                Complete the onboarding process to set up your AI voice agent, then return here to customize voice settings.
              </p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="dashboard p-6 lg:p-8 max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-deep-charcoal tracking-tight">
            Voice Agent <span className="font-light text-warm-stone">/ Settings</span>
          </h1>
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || isSaving}
            className="px-6 py-2.5 bg-burgundy hover:bg-burgundy-dark text-white text-[13px] font-semibold rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSaving && <Spinner size="sm" className="border-white border-t-white/30" />}
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

        <div className="space-y-6">
          <VoiceEngineSelector
            currentEngine={currentEngine}
            pendingEngine={pendingEngine}
            engineStatus={engineConfig?.voice_engine_status}
            onEngineSwitch={handleEngineSwitch}
          />

          {currentEngine === 'elevenlabs' && (
            <>
              <VoiceCurrentCard
                currentVoiceId={currentVoiceId}
                pendingVoiceId={pendingVoiceId}
                selectedBrowserVoice={selectedBrowserVoice}
                savedVoiceName={config.voice_name}
                savedVoiceId={config.voice_id}
                currentLanguage={currentLanguage}
                restaurantName={config.restaurant_name || undefined}
                isBrowserOpen={isBrowserOpen}
                loadingAudio={loadingAudio}
                playingVoiceId={playingVoiceId}
                onPlay={handlePlayVoice}
                onToggleBrowser={() => setIsBrowserOpen(!isBrowserOpen)}
              />

              <VoiceTuningPanel
                settings={currentSettings}
                currentVoiceId={currentVoiceId}
                loadingAudio={loadingAudio}
                onSettingChange={handleSettingChange}
                onReset={() => setPendingSettings({ ...DEFAULT_VOICE_SETTINGS })}
                onPreview={handlePreviewWithSettings}
              />

              {isBrowserOpen && (
                <section className="bg-white border border-border-gray rounded-2xl p-6">
                  <h2 className="text-lg font-bold text-deep-charcoal mb-4 flex items-center gap-2">
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
                    onSelectVoice={setPendingVoiceId}
                    onPlayVoice={handlePlayVoice}
                    onLoadMore={handleLoadMore}
                    isLoading={isLoadingVoices}
                    source={voicesSource}
                  />
                </section>
              )}

              <VoiceLanguagePicker
                currentLanguage={currentLanguage}
                savedLanguage={config?.language}
                onChange={setPendingLanguage}
              />

              <VoiceAgentInfo
                agentId={config.agent_id}
                updatedAt={config.agent_updated_at}
                createdAt={config.created_at}
              />
            </>
          )}

          {currentEngine === 'openai_realtime' && (
            <>
              <OpenAIVoicePicker
                currentOpenAIVoice={currentOpenAIVoice}
                savedOpenAIVoice={engineConfig?.openai_voice_id}
                onSelect={setPendingOpenAIVoice}
              />
              <OpenAIEngineInfo
                engineStatus={engineConfig?.voice_engine_status}
                currentOpenAIVoice={currentOpenAIVoice}
              />
            </>
          )}
        </div>

        <VoiceEngineSwitchModal
          isOpen={showEngineSwitchConfirm}
          engineSwitchTarget={engineSwitchTarget}
          onConfirm={confirmEngineSwitch}
          onClose={() => setShowEngineSwitchConfirm(false)}
        />
      </div>
    </DashboardLayout>
  );
}
