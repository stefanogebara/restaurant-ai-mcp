/**
 * Voice & Language Settings Page
 *
 * Orchestrator page — manages state and data fetching.
 * UI is delegated to focused subcomponents in components/voice/.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate } from 'react-router-dom';
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

import SettingsTabs, { type SettingsTabDef } from '../components/common/SettingsTabs';
import VoiceEngineSelector from '../components/voice/VoiceEngineSelector';
import VoiceDraftActions from '../components/voice/VoiceDraftActions';
import VoiceCurrentCard from '../components/voice/VoiceCurrentCard';
import VoiceTuningPanel from '../components/voice/VoiceTuningPanel';
import VoiceLanguagePicker from '../components/voice/VoiceLanguagePicker';
import VoiceAgentInfo from '../components/voice/VoiceAgentInfo';
import OpenAIVoicePicker from '../components/voice/OpenAIVoicePicker';
import OpenAIEngineInfo from '../components/voice/OpenAIEngineInfo';
import VoiceEngineSwitchModal from '../components/voice/VoiceEngineSwitchModal';
import VoiceFilters from '../components/voice/VoiceFilters';
import VoiceGrid from '../components/voice/VoiceGrid';
import VoicePersonaPanel from '../components/dashboard/VoicePersonaPanel';
// VoiceExperimentPanel removed — non-functional (K-1)
import PhoneIntegrationPanel from '../components/voice/PhoneIntegrationPanel';
import VoicePhoneOnlyState from '../components/voice/VoicePhoneOnlyState';
// AIStrategyPanel removed — dead feature
// StrategyMetricsWidget moved to insights-only (removed from voice settings)

import { DEFAULT_VOICE_SETTINGS } from '../components/voice/voiceTypes';
import type { VoiceSettings } from '../components/voice/voiceTypes';
import { legacyVoiceSettingsRedirect } from '../lib/legacySettingsRedirect';

export default function VoiceSettingsPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const { hasAccess, isLoading: isLoadingAccess, isError: isAccessError, refetch: refetchAccess } = useFeatureAccess('voice_ai');
  const canLoadVoiceData = !isLoadingAccess && !isAccessError && hasAccess;

  const { data: config, isLoading: isLoadingConfig, isError: isConfigError, refetch: refetchConfig } = useVoiceSettings({ enabled: canLoadVoiceData });
  const saveMutation = useSaveVoiceSettings();
  const { data: engineConfig, isLoading: isLoadingEngine, isError: isEngineError, refetch: refetchEngine } = useVoiceEngineSettings({ enabled: canLoadVoiceData });
  const saveEngineMutation = useSaveVoiceEngine();
  // ─── Pending changes ──────────────────────────────────────────────────────────

  const [pendingVoiceId, setPendingVoiceId] = useState<string | null>(null);
  const [pendingSettings, setPendingSettings] = useState<VoiceSettings | null>(null);
  const [pendingLanguage, setPendingLanguage] = useState<string | null>(null);
  const [pendingEngine, setPendingEngine] = useState<VoiceEngineSettings['voice_engine'] | null>(null);
  const [pendingOpenAIVoice, setPendingOpenAIVoice] = useState<string | null>(null);
  const [showEngineSwitchConfirm, setShowEngineSwitchConfirm] = useState(false);
  const [engineSwitchTarget, setEngineSwitchTarget] = useState<VoiceEngineSettings['voice_engine'] | null>(null);
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);
  const [activeVoicePane, setActiveVoicePane] = useState(() =>
    typeof window !== 'undefined' && window.location.hash === '#voice-settings:phone' ? 'phone' : 'voice');

  // ─── Derived state ────────────────────────────────────────────────────────────

  const isSaving = saveMutation.isPending || saveEngineMutation.isPending;
  const isDirty = pendingVoiceId !== null || pendingSettings !== null || pendingLanguage !== null || pendingEngine !== null || pendingOpenAIVoice !== null;

  const currentEngine = pendingEngine || engineConfig?.voice_engine || 'elevenlabs';
  const currentOpenAIVoice = pendingOpenAIVoice || engineConfig?.openai_voice_id || 'alloy';
  const currentSettings: VoiceSettings = pendingSettings || config?.voice_settings || DEFAULT_VOICE_SETTINGS;
  const currentLanguage = pendingLanguage || config?.language || 'en';
  const currentVoiceId = pendingVoiceId || config?.voice_id || '';

  // ─── Voice browser ────────────────────────────────────────────────────────────

  const { voices, isLoadingVoices, isLoadingMore, hasMore, voicesSource, error: voiceBrowserError, refetch: refetchVoices, filters, setFilters, handleLoadMore } = useVoiceBrowser({
    isOpen: isBrowserOpen,
    language: currentLanguage,
    restaurantName: config?.restaurant_name || undefined,
  });

  const selectedBrowserVoice = voices.find(v => v.id === pendingVoiceId);

  // ─── Audio playback ───────────────────────────────────────────────────────────

  const { playingVoiceId, playingSource, loadingAudio, loadingSource, handlePlayVoice, handlePreviewWithSettings, stopPlayback } = useAudioPlayback({
    voices,
    currentVoiceId,
    currentLanguage,
    restaurantName: config?.restaurant_name || undefined,
    currentSettings,
    enabled: currentEngine === 'elevenlabs' && activeVoicePane === 'voice',
    onError: (error) => toast.error(t(`voiceSettings.${error}`)),
  });

  // ─── Handlers ─────────────────────────────────────────────────────────────────

  const handleToggleVoiceBrowser = () => {
    if (isBrowserOpen) stopPlayback('library');
    setIsBrowserOpen(!isBrowserOpen);
  };

  const handleSettingChange = (key: keyof VoiceSettings, value: number) => {
    setPendingSettings((previous) => ({ ...(previous ?? config?.voice_settings ?? DEFAULT_VOICE_SETTINGS), [key]: value }));
  };

  const handlePresetChange = (preset: Pick<VoiceSettings, 'stability' | 'similarity_boost' | 'style'>) => {
    setPendingSettings((previous) => ({ ...(previous ?? config?.voice_settings ?? DEFAULT_VOICE_SETTINGS), ...preset }));
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

  const handleDiscardVoice = () => {
    stopPlayback();
    setPendingVoiceId(null); setPendingSettings(null); setPendingLanguage(null);
    setPendingEngine(null); setPendingOpenAIVoice(null);
    setShowEngineSwitchConfirm(false); setEngineSwitchTarget(null); setIsBrowserOpen(false);
  };

  const handleSave = () => {
    const hasElevenLabsChanges = pendingVoiceId !== null || pendingSettings !== null || pendingLanguage !== null;
    const hasEngineChanges = pendingEngine !== null || pendingOpenAIVoice !== null;
    const expectedCalls = (hasElevenLabsChanges ? 1 : 0) + (hasEngineChanges ? 1 : 0);
    if (expectedCalls === 0) return;

    // Partial-save fix: clear pending state per-mutation in each onSuccess so
    // that if one half fails the other half's pending state doesn't linger,
    // which previously made users hit Save again on already-persisted values.
    // Combined success toast still requires BOTH halves to succeed.
    let completedCalls = 0;
    const onAllComplete = () => {
      completedCalls++;
      if (completedCalls >= expectedCalls) {
        toast.success(t('voice.settingsSaved', 'Voice settings saved successfully'));
      }
    };

    if (hasElevenLabsChanges) {
      const body: Record<string, unknown> = {};
      if (pendingVoiceId) body.voice_id = pendingVoiceId;
      if (pendingVoiceId && selectedBrowserVoice?.name) body.voice_name = selectedBrowserVoice.name;
      if (pendingSettings) body.voice_settings = pendingSettings;
      if (pendingLanguage) body.language = pendingLanguage;
      saveMutation.mutate(body, {
        onSuccess: (result) => {
          // Clear this half's pending state regardless of the other half.
          setPendingVoiceId(current => current === pendingVoiceId ? null : current);
          setPendingSettings(current => current === pendingSettings ? null : current);
          setPendingLanguage(current => current === pendingLanguage ? null : current);
          if (result?.sync_warning) {
            toast.info(t('voice.savedWithSyncWarning', 'Settings saved locally. Agent sync will apply on next refresh.'));
          }
          onAllComplete();
        },
        onError: (error) => toast.error(error instanceof Error ? error.message : t('voice.saveSettingsFailed', 'Failed to save voice settings')),
      });
    }

    if (hasEngineChanges) {
      const engineBody: Partial<Pick<VoiceEngineSettings, 'voice_engine' | 'openai_voice_id'>> = {};
      if (pendingEngine) engineBody.voice_engine = pendingEngine;
      if (pendingOpenAIVoice) engineBody.openai_voice_id = pendingOpenAIVoice;
      saveEngineMutation.mutate(engineBody, {
        onSuccess: () => {
          setPendingEngine(current => current === pendingEngine ? null : current);
          setPendingOpenAIVoice(current => current === pendingOpenAIVoice ? null : current);
          onAllComplete();
        },
        onError: (error) => toast.error(error instanceof Error ? error.message : t('voice.saveEngineFailed', 'Failed to save engine settings')),
      });
    }
  };

  // ─── Early returns ────────────────────────────────────────────────────────────

  // Old bookmarks and provider callbacks must reach their new owner even
  // when this restaurant does not have access to the voice feature.
  const legacyDestination = typeof window === 'undefined'
    ? null
    : legacyVoiceSettingsRedirect(window.location.hash, window.location.search);
  if (legacyDestination) return <Navigate to={legacyDestination} replace />;

  if (isAccessError) {
    return (
      <DashboardLayout>
        <section className="p-6 mt-14 lg:mt-0 lg:p-8 max-w-5xl" role="alert">
          <h1 className="font-serif text-3xl text-deep-charcoal">{t('voiceSettings.accessCheckFailedTitle')}</h1>
          <p className="mt-3 max-w-2xl text-[15px] text-muted-stone">{t('voiceSettings.accessCheckFailedHint')}</p>
          <button
            type="button"
            onClick={() => { void refetchAccess(); }}
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-burgundy px-5 py-2.5 text-sm font-medium text-white hover:bg-burgundy-dark"
          >
            {t('common.retry')}
          </button>
        </section>
      </DashboardLayout>
    );
  }

  if (!isLoadingAccess && !hasAccess) {
    return (
      <UpgradePrompt
        requiredPlan="growth"
        feature={t('voiceSettings.upgradeFeature')}
        description={t('voiceSettings.upgradeDescription')}
      />
    );
  }

  if (isLoadingConfig || isLoadingAccess || isLoadingEngine) {
    return (
      <DashboardLayout>
        <div className="p-6 mt-14 lg:mt-0 lg:p-8 max-w-5xl" role="status" aria-label={t('voiceSettings.loadingAriaLabel', 'Loading voice settings')}>
          <Skeleton className="h-4 w-48 mb-2" />
          <Skeleton className="h-8 w-64 mb-1" />
          <Skeleton className="h-4 w-80 mb-6" />
          <div className="space-y-6">
            <div className="py-5">
              <Skeleton className="h-5 w-32 mb-4" />
              <div className="flex items-center justify-between">
                <div><Skeleton className="h-5 w-40 mb-2" /><Skeleton className="h-4 w-24" /></div>
                <Skeleton className="h-10 w-32 rounded-lg" />
              </div>
            </div>
            <div className="border-t hairline mt-10 mb-10" />
            <div className="py-5">
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

  // A failed voice-settings fetch must NOT fall through to the "!config?.agent_id"
  // branch below — that would tell a restaurant with a fully-working agent that
  // they have "No agent configured" and push them back to /onboarding. Surface
  // the fetch failure explicitly with a retry instead.
  if (isConfigError || isEngineError) {
    return (
      <DashboardLayout>
        <div className="p-6 mt-14 lg:mt-0 lg:p-8 max-w-5xl">
          <div className="mt-8 text-center py-16">
            <div className="max-w-md mx-auto">
              <ThiingsIcon name="alert-circle" pxSize={28} className="text-red-700 mx-auto mb-3" />
              <h2 className="font-serif text-[26px] text-deep-charcoal mb-2">{t('dashboard.errorTitle')}</h2>
              <p className="text-[15px] text-muted-stone mb-6">{t('errors.serverError')}</p>
              <button
                type="button"
                onClick={() => { void refetchConfig(); void refetchEngine(); }}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-semibold rounded-xl transition-colors"
              >
                <ThiingsIcon name="refresh" size="xs" />
                {t('common.retry')}
              </button>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!config?.agent_id) {
    return <DashboardLayout><VoicePhoneOnlyState /></DashboardLayout>;
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="p-6 mt-14 lg:mt-0 lg:p-8 max-w-5xl">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between mb-8">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone mb-2">
              {t('voiceSettings.pageEyebrow')}
            </p>
            <h1 className="font-serif text-3xl sm:text-4xl text-deep-charcoal tracking-tight">
              {t('voiceSettings.pageTitle')}
            </h1>
            <p className="text-[15px] text-muted-stone mt-2 max-w-2xl">
              {t('voiceSettings.pageIntro')}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <Link
              to="/host-dashboard/calls"
              className="liquid-capsule inline-flex min-h-11 items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-deep-charcoal hover:bg-soft-gray focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy/60"
            >
              <ThiingsIcon name="phone-call" size="sm" />
              {t('navigation.callHistory')}
            </Link>
            {(isDirty || isSaving) && <VoiceDraftActions isSaving={isSaving} onSave={handleSave} onDiscard={handleDiscardVoice} />}
          </div>
        </div>

        {(() => {
          // Tabs split the previous wall-of-10-sections page into focused
          // panes. All panes stay mounted (hidden via Tailwind) so dirty
          // pending edits survive tab switches and the shared Save button
          // still saves everything in one shot.
          const voiceTab = (
            <div className="space-y-6">
              {currentEngine === 'elevenlabs' && (
                <VoiceAgentInfo agentId={config.agent_id} updatedAt={config.agent_updated_at} createdAt={config.created_at} />
              )}
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
                    loadingAudio={loadingSource === 'configured' ? loadingAudio : null}
                    playingVoiceId={playingSource === 'configured' ? playingVoiceId : null}
                    onPlay={() => { void handlePreviewWithSettings(); }}
                    onToggleBrowser={handleToggleVoiceBrowser}
                  />
                  <VoiceTuningPanel
                    settings={currentSettings}
                    currentVoiceId={currentVoiceId}
                    loadingAudio={loadingSource === 'configured' ? loadingAudio : null}
                    playingVoiceId={playingSource === 'configured' ? playingVoiceId : null}
                    onSettingChange={handleSettingChange}
                    onApplyPreset={handlePresetChange}
                    onReset={() => setPendingSettings({ ...DEFAULT_VOICE_SETTINGS })}
                    onPreview={() => { void handlePreviewWithSettings(); }}
                  />
                  {isBrowserOpen && (
                    <section className="py-5">
                      <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone mb-4 flex items-center gap-2">
                        <ThiingsIcon name="search" pxSize={20} />
                        {t('voiceSettings.voiceLibrary', 'Voice Library')}
                      </h2>
                      {voiceBrowserError ? (
                        <div className="text-center py-10">
                          <div className="w-14 h-14 mx-auto mb-3 bg-red-50 rounded-2xl flex items-center justify-center">
                            <ThiingsIcon name="alert-circle" pxSize={24} />
                          </div>
                          <p className="text-sm font-semibold text-deep-charcoal">
                            {t('voiceSettings.voiceLoadError', 'Could not load voices')}
                          </p>
                          <p className="text-xs text-stone-gray mt-1 mb-4">
                            {t('voiceSettings.voiceLoadErrorHint', 'The voice service may be temporarily unavailable. Please try again.')}
                          </p>
                          <button
                            type="button"
                            onClick={() => refetchVoices()}
                            className="px-5 py-2 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-medium rounded-xl transition-colors"
                          >
                            {t('common.retry', 'Retry')}
                          </button>
                        </div>
                      ) : (
                        <>
                          <VoiceFilters filters={filters} onChange={setFilters} defaultLanguage={currentLanguage} hideSearch={voicesSource === 'own_voices_fallback'} />
                          <VoiceGrid
                            voices={voices}
                            selectedVoiceId={pendingVoiceId || config.voice_id || ''}
                            playingVoiceId={playingSource === 'library' ? playingVoiceId : null}
                            loadingAudioId={loadingSource === 'library' ? loadingAudio : null}
                            hasMore={hasMore}
                            isLoadingMore={isLoadingMore}
                            onSelectVoice={setPendingVoiceId}
                            onPlayVoice={handlePlayVoice}
                            onLoadMore={handleLoadMore}
                            isLoading={isLoadingVoices}
                            source={voicesSource}
                          />
                        </>
                      )}
                    </section>
                  )}
                  <VoiceLanguagePicker currentLanguage={currentLanguage} savedLanguage={config?.language} onChange={setPendingLanguage} />
                </>
              )}

              {currentEngine === 'openai_realtime' && (
                <>
                  <OpenAIVoicePicker currentOpenAIVoice={currentOpenAIVoice} onSelect={setPendingOpenAIVoice} />
                </>
              )}
              <VoicePersonaPanel showProviderRefresh={currentEngine === 'elevenlabs'} />
              {currentEngine === 'openai_realtime' && pendingEngine === null && <OpenAIEngineInfo engineStatus={engineConfig?.voice_engine_status} currentOpenAIVoice={engineConfig?.openai_voice_id || 'alloy'} />}
            </div>
          );

          const phoneTab = <PhoneIntegrationPanel />;

          const tabs: SettingsTabDef[] = [
            { id: 'voice',     label: t('voiceSettings.tab.voice', 'Voice & language'), content: voiceTab },
            { id: 'phone',     label: t('voiceSettings.tab.phone', 'Phone'),            content: phoneTab },
          ];

          return (
            <>
              <SettingsTabs tabs={tabs} hashKey="voice-settings" onTabChange={setActiveVoicePane} />
              <div className="hairline my-10" />
              <p className="text-[15px] text-muted-stone">
                {t('voiceSettings.otherChannels')}{' '}
                <Link to="/host-dashboard/whatsapp" className="text-burgundy hover:text-burgundy-dark underline underline-offset-2">
                  WhatsApp
                </Link>
                {' · '}
                <Link to="/host-dashboard/integrations" className="text-burgundy hover:text-burgundy-dark underline underline-offset-2">
                  {t('navigation.integrations')}
                </Link>
              </p>
            </>
          );
        })()}

        {(isDirty || isSaving) && <div className="h-24 sm:hidden" aria-hidden="true" />}

        <VoiceEngineSwitchModal isOpen={showEngineSwitchConfirm} engineSwitchTarget={engineSwitchTarget} onConfirm={confirmEngineSwitch} onClose={() => setShowEngineSwitchConfirm(false)} />
      </div>
    </DashboardLayout>
  );
}
