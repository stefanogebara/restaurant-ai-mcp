/**
 * Voice & Language Settings Page
 *
 * Orchestrator page — manages state and data fetching.
 * UI is delegated to focused subcomponents in components/voice/.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '../components/layout/DashboardLayout';
import { Skeleton } from '../components/common/Skeleton';
import { useToast } from '../contexts/ToastContext';
import { useVoiceSettings, useSaveVoiceSettings } from '../hooks/useVoiceSettings';
import { useVoiceEngineSettings, useSaveVoiceEngine } from '../hooks/useVoiceEngineSettings';
import type { VoiceEngineSettings } from '../hooks/useVoiceEngineSettings';
import { useFeatureAccess } from '../hooks/useSubscription';
import UpgradePrompt from '../components/common/UpgradePrompt';
import ThiingsIcon from '../components/common/ThiingsIcon';
import { useVoiceBrowser } from '../hooks/useVoiceBrowser';
import { useAudioPlayback } from '../hooks/useAudioPlayback';

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
import ReferralWidget from '../components/dashboard/ReferralWidget';
import VoicePersonaPanel from '../components/dashboard/VoicePersonaPanel';
import EmbedSnippetPanel from '../components/dashboard/EmbedSnippetPanel';
import { useQuery } from '@tanstack/react-query';
import { authFetch } from '../services/api';

import { DEFAULT_VOICE_SETTINGS } from '../components/voice/voiceTypes';
import type { VoiceSettings } from '../components/voice/voiceTypes';
import { useWhatsAppIntegrationStatus } from '../hooks/useWhatsAppSettings';

export default function VoiceSettingsPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const { hasAccess, isLoading: isLoadingAccess } = useFeatureAccess('voice_ai');

  const { data: config, isLoading: isLoadingConfig } = useVoiceSettings();
  const saveMutation = useSaveVoiceSettings();
  const { data: engineConfig } = useVoiceEngineSettings();
  const saveEngineMutation = useSaveVoiceEngine();
  const { data: waStatus } = useWhatsAppIntegrationStatus();
  const { data: dashData } = useQuery({
    queryKey: ['hostDashboard'],
    queryFn: async () => {
      const res = await authFetch('/host-dashboard?action=dashboard');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
  const slug: string = (dashData as { restaurant_slug?: string } | undefined)?.restaurant_slug || '';

  // ─── Pending changes ──────────────────────────────────────────────────────────

  const [pendingVoiceId, setPendingVoiceId] = useState<string | null>(null);
  const [pendingSettings, setPendingSettings] = useState<VoiceSettings | null>(null);
  const [pendingLanguage, setPendingLanguage] = useState<string | null>(null);
  const [pendingEngine, setPendingEngine] = useState<VoiceEngineSettings['voice_engine'] | null>(null);
  const [pendingOpenAIVoice, setPendingOpenAIVoice] = useState<string | null>(null);
  const [showEngineSwitchConfirm, setShowEngineSwitchConfirm] = useState(false);
  const [engineSwitchTarget, setEngineSwitchTarget] = useState<VoiceEngineSettings['voice_engine'] | null>(null);
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);

  // ─── Derived state ────────────────────────────────────────────────────────────

  const isSaving = saveMutation.isPending || saveEngineMutation.isPending;
  const isDirty = pendingVoiceId !== null || pendingSettings !== null || pendingLanguage !== null || pendingEngine !== null || pendingOpenAIVoice !== null;

  const currentEngine = pendingEngine || engineConfig?.voice_engine || 'elevenlabs';
  const currentOpenAIVoice = pendingOpenAIVoice || engineConfig?.openai_voice_id || 'alloy';
  const currentSettings: VoiceSettings = pendingSettings || config?.voice_settings || DEFAULT_VOICE_SETTINGS;
  const currentLanguage = pendingLanguage || config?.language || 'en';
  const currentVoiceId = pendingVoiceId || config?.voice_id || '';

  // ─── Voice browser ────────────────────────────────────────────────────────────

  const { voices, isLoadingVoices, isLoadingMore, hasMore, voicesSource, filters, setFilters, handleLoadMore } = useVoiceBrowser({
    isOpen: isBrowserOpen,
    language: currentLanguage,
    restaurantName: config?.restaurant_name || undefined,
  });

  const selectedBrowserVoice = voices.find(v => v.id === pendingVoiceId);

  // ─── Audio playback ───────────────────────────────────────────────────────────

  const { playingVoiceId, loadingAudio, handlePlayVoice, handlePreviewWithSettings } = useAudioPlayback({
    voices,
    currentVoiceId,
    currentLanguage,
    restaurantName: config?.restaurant_name || undefined,
    currentSettings,
  });

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
              <h2 className="text-lg font-bold text-deep-charcoal mb-2">{t('settings.noAgentConfigured')}</h2>
              <p className="text-sm text-stone-gray mb-6">
                {t('settings.noAgentDesc')}
              </p>
              <a
                href="/onboarding"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-semibold rounded-xl transition-colors"
              >
                <ThiingsIcon name="lightning" size="xs" />
                {t('settings.completeSetup')}
              </a>
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
          <VoiceEngineSelector currentEngine={currentEngine} pendingEngine={pendingEngine} engineStatus={engineConfig?.voice_engine_status} onEngineSwitch={handleEngineSwitch} />

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
                onPreview={() => handlePreviewWithSettings(toast)}
              />
              {isBrowserOpen && (
                <section className="bg-white border border-border-gray rounded-2xl p-6">
                  <h2 className="text-lg font-bold text-deep-charcoal mb-4 flex items-center gap-2">
                    <ThiingsIcon name="search" pxSize={20} />
                    Voice Library
                  </h2>
                  <VoiceFilters filters={filters} onChange={setFilters} defaultLanguage={currentLanguage} hideSearch={voicesSource === 'own_voices_fallback'} />
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
              <VoiceLanguagePicker currentLanguage={currentLanguage} savedLanguage={config?.language} onChange={setPendingLanguage} />
              <VoiceAgentInfo agentId={config.agent_id} updatedAt={config.agent_updated_at} createdAt={config.created_at} />
            </>
          )}

          {currentEngine === 'openai_realtime' && (
            <>
              <OpenAIVoicePicker currentOpenAIVoice={currentOpenAIVoice} savedOpenAIVoice={engineConfig?.openai_voice_id} onSelect={setPendingOpenAIVoice} />
              <OpenAIEngineInfo engineStatus={engineConfig?.voice_engine_status} currentOpenAIVoice={currentOpenAIVoice} />
            </>
          )}
          {waStatus && (
            <div className="bg-white border border-border-gray rounded-2xl p-6">
              <h2 className="text-sm font-semibold text-deep-charcoal uppercase tracking-wider mb-3">WhatsApp Status</h2>
              {waStatus.meta.approved ? (
                <div className="space-y-1">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    Connected
                  </span>
                  {waStatus.meta.phone_number && (
                    <p className="text-sm text-deep-charcoal mt-2">
                      <span className="text-warm-stone">Phone:</span> {waStatus.meta.phone_number}
                    </p>
                  )}
                  {waStatus.meta.quality_rating && (
                    <p className="text-sm text-deep-charcoal">
                      <span className="text-warm-stone">Quality rating:</span> {waStatus.meta.quality_rating}
                    </p>
                  )}
                </div>
              ) : waStatus.meta.configured && !waStatus.meta.error ? (
                <div className="space-y-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                    Pending Approval
                  </span>
                  <a href="https://business.facebook.com/" target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline block">
                    Check Meta Business Manager →
                  </a>
                </div>
              ) : (
                <div className="space-y-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    Not Configured
                  </span>
                  {waStatus.meta.error && <p className="text-xs text-red-600">{waStatus.meta.error}</p>}
                  <a href="https://business.facebook.com/" target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline block">
                    Check Meta Business Manager →
                  </a>
                </div>
              )}
            </div>
          )}
          <VoicePersonaPanel />
          {slug && <EmbedSnippetPanel slug={slug} />}
          <ReferralWidget />
        </div>

        <VoiceEngineSwitchModal isOpen={showEngineSwitchConfirm} engineSwitchTarget={engineSwitchTarget} onConfirm={confirmEngineSwitch} onClose={() => setShowEngineSwitchConfirm(false)} />
      </div>
    </DashboardLayout>
  );
}
