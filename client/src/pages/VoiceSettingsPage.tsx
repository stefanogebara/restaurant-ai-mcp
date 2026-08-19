/**
 * Voice & Language Settings Page
 *
 * Orchestrator page — manages state and data fetching.
 * UI is delegated to focused subcomponents in components/voice/.
 */

import { useState, useRef, useEffect } from 'react';
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
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';

import SettingsTabs, { type SettingsTabDef } from '../components/common/SettingsTabs';
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
import VoicePersonaPanel from '../components/dashboard/VoicePersonaPanel';
// VoiceExperimentPanel removed — non-functional (K-1)
import BookingChannelsPanel from '../components/dashboard/BookingChannelsPanel';
import POSIntegrationPanel from '../components/dashboard/POSIntegrationPanel';
import StripeConnectPanel from '../components/dashboard/StripeConnectPanel';
import InstagramPanel from '../components/dashboard/InstagramPanel';
import PhoneIntegrationPanel from '../components/voice/PhoneIntegrationPanel';
// AIStrategyPanel removed — dead feature
// StrategyMetricsWidget moved to insights-only (removed from voice settings)
import { authFetch, hostAPI } from '../services/api';

import { DEFAULT_VOICE_SETTINGS } from '../components/voice/voiceTypes';
import type { VoiceSettings } from '../components/voice/voiceTypes';
import { useWhatsAppIntegrationStatus } from '../hooks/useWhatsAppSettings';

export default function VoiceSettingsPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const { hasAccess, isLoading: isLoadingAccess } = useFeatureAccess('voice_ai');
  const canLoadVoiceData = !isLoadingAccess && hasAccess;

  const { data: config, isLoading: isLoadingConfig, isError: isConfigError, refetch: refetchConfig } = useVoiceSettings({ enabled: canLoadVoiceData });
  const saveMutation = useSaveVoiceSettings();
  const { data: engineConfig } = useVoiceEngineSettings({ enabled: canLoadVoiceData });
  const saveEngineMutation = useSaveVoiceEngine();
  const { data: waStatus } = useWhatsAppIntegrationStatus({ enabled: canLoadVoiceData });
  const queryClient = useQueryClient();
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up the post-retry 5s invalidate-queries timeout if the user navigates
  // away before it fires — prevents setState-on-unmounted-component warnings.
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, []);

  const retryAgentMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch('/api/elevenlabs-agent-create', { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || t('voice.createAgentFailed', 'Failed to create agent'));
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success(t('voice.agentCreationStarted', 'Agent creation started. This may take up to 2 minutes.'));
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = setTimeout(() => queryClient.invalidateQueries({ queryKey: ['voiceSettings'] }), 5000);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : t('voice.createAgentFailed', 'Failed to create agent'));
    },
  });
  // Share React Query cache with Dashboard.tsx and FloorPlanEditor.tsx — same
  // queryKey AND queryFn so all three pages read the same axios-wrapped shape.
  // Different queryFns under the same key would clobber each other's cached
  // payload depending on render order.
  const { data: dashData } = useQuery({
    queryKey: ['dashboard'],
    queryFn: hostAPI.getDashboard,
    enabled: canLoadVoiceData,
    staleTime: 5 * 60 * 1000,
  });
  const slug: string = (dashData as { data?: { slug?: string } } | undefined)?.data?.slug || '';

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

  const { voices, isLoadingVoices, isLoadingMore, hasMore, voicesSource, error: voiceBrowserError, refetch: refetchVoices, filters, setFilters, handleLoadMore } = useVoiceBrowser({
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
          setPendingVoiceId(null);
          setPendingSettings(null);
          setPendingLanguage(null);
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
          setPendingEngine(null);
          setPendingOpenAIVoice(null);
          onAllComplete();
        },
        onError: (error) => toast.error(error instanceof Error ? error.message : t('voice.saveEngineFailed', 'Failed to save engine settings')),
      });
    }
  };

  // ─── Early returns ────────────────────────────────────────────────────────────

  if (!isLoadingAccess && !hasAccess) {
    return (
      <UpgradePrompt
        requiredPlan="growth"
        feature={t('voiceSettings.upgradeFeature')}
        description={t('voiceSettings.upgradeDescription')}
      />
    );
  }

  if (isLoadingConfig || isLoadingAccess) {
    return (
      <DashboardLayout>
        <div className="p-6 lg:p-8 max-w-5xl" role="status" aria-label={t('voiceSettings.loadingAriaLabel', 'Loading voice settings')}>
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
            <div className="border-t border-[#E5E7EB] mt-8 mb-8" />
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
  if (isConfigError) {
    return (
      <DashboardLayout>
        <div className="p-6 lg:p-8 max-w-5xl">
          <div className="mt-8 text-center py-16">
            <div className="border border-[#E5E7EB] rounded-lg p-8 max-w-md mx-auto">
              <div className="w-14 h-14 mx-auto mb-3 bg-red-50 rounded-2xl flex items-center justify-center">
                <ThiingsIcon name="alert-circle" pxSize={24} />
              </div>
              <h2 className="text-lg font-bold text-deep-charcoal mb-2">{t('dashboard.errorTitle')}</h2>
              <p className="text-sm text-stone-gray mb-6">{t('errors.serverError')}</p>
              <button
                type="button"
                onClick={() => refetchConfig()}
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
    const hasRestaurantName = !!config?.restaurant_name;
    return (
      <DashboardLayout>
        <div className="p-6 lg:p-8 max-w-5xl space-y-6">
          <div className="mt-8 text-center py-16">
            <div className="border border-[#E5E7EB] rounded-lg p-8 max-w-md mx-auto">
              {hasRestaurantName ? (
                <>
                  <div className="mx-auto mb-4 flex items-center justify-center">
                    <Spinner size="lg" className="border-burgundy border-t-burgundy/30" />
                  </div>
                  <h2 className="text-lg font-bold text-deep-charcoal mb-2">
                    {t('voice.agentCreating', 'Creating your voice agent...')}
                  </h2>
                  <p className="text-sm text-stone-gray mb-6">
                    {t('voice.agentCreatingDesc', 'This may take up to 2 minutes. If the agent does not appear, try again below.')}
                  </p>
                  <button
                    type="button"
                    onClick={() => retryAgentMutation.mutate()}
                    disabled={retryAgentMutation.isPending}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {retryAgentMutation.isPending ? (
                      <Spinner size="sm" className="border-white border-t-white/30" />
                    ) : (
                      <ThiingsIcon name="refresh" size="xs" />
                    )}
                    {retryAgentMutation.isPending
                      ? t('voice.retrying', 'Creating...')
                      : t('voice.retryAgentCreation', 'Retry Agent Creation')}
                  </button>
                </>
              ) : (
                <>
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
                </>
              )}
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-5xl">
        <div className="flex items-center justify-between mb-8">
          <h1 className="font-serif text-3xl sm:text-4xl text-deep-charcoal tracking-tight">
            {t('navigation.voiceAgent')} <span className="font-light text-warm-stone">/ {t('common.settings')}</span>
          </h1>
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={!isDirty || isSaving}
              className="px-6 py-2.5 bg-burgundy hover:bg-burgundy-dark text-white text-[13px] font-semibold rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSaving && <Spinner size="sm" className="border-white border-t-white/30" />}
              {isSaving ? t('voiceSettings.saving', 'Saving...') : t('voiceSettings.saveChanges', 'Save Changes')}
            </button>
            {!isDirty && !isSaving && (
              <p className="text-xs text-warm-stone">
                {t('voiceSettings.changeSettingsHint', 'Change a setting above to enable saving')}
              </p>
            )}
          </div>
        </div>

        {(() => {
          // Tabs split the previous wall-of-10-sections page into focused
          // panes. All panes stay mounted (hidden via Tailwind) so dirty
          // pending edits survive tab switches and the shared Save button
          // still saves everything in one shot.
          const voiceTab = (
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
                    <section className="py-5">
                      <h2 className="text-[13px] font-semibold uppercase tracking-widest text-[#111827] mb-4 flex items-center gap-2">
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
                        </>
                      )}
                    </section>
                  )}
                  <VoiceLanguagePicker currentLanguage={currentLanguage} savedLanguage={config?.language} onChange={setPendingLanguage} />
                  <VoicePersonaPanel />
                  <VoiceAgentInfo agentId={config.agent_id} updatedAt={config.agent_updated_at} createdAt={config.created_at} />
                </>
              )}

              {currentEngine === 'openai_realtime' && (
                <>
                  <OpenAIVoicePicker currentOpenAIVoice={currentOpenAIVoice} savedOpenAIVoice={engineConfig?.openai_voice_id} onSelect={setPendingOpenAIVoice} />
                  <VoicePersonaPanel />
                  <OpenAIEngineInfo engineStatus={engineConfig?.voice_engine_status} currentOpenAIVoice={currentOpenAIVoice} />
                </>
              )}
            </div>
          );

          const phoneTab = <PhoneIntegrationPanel />;

          const whatsappTab = waStatus ? (
            <div>
              <h2 className="text-[13px] font-semibold uppercase tracking-widest text-[#111827] mb-3">
                {t('voiceSettings.whatsappStatus', 'WhatsApp Status')}
              </h2>
              {waStatus.meta.approved ? (
                <div className="space-y-1">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                    {t('voiceSettings.waConnected', 'Connected')}
                  </span>
                  {waStatus.meta.phone_number && (
                    <p className="text-sm text-deep-charcoal mt-2">
                      <span className="text-warm-stone">{t('voiceSettings.waPhone', 'Phone')}:</span> {waStatus.meta.phone_number}
                    </p>
                  )}
                  {waStatus.meta.quality_rating && (
                    <p className="text-sm text-deep-charcoal">
                      <span className="text-warm-stone">{t('voiceSettings.waQualityRating', 'Quality rating')}:</span> {t(`voiceSettings.waQuality.${waStatus.meta.quality_rating.toLowerCase()}`, waStatus.meta.quality_rating)}
                    </p>
                  )}
                </div>
              ) : waStatus.meta.configured && !waStatus.meta.error ? (
                <div className="space-y-3">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                    {t('voiceSettings.waPendingApproval', 'Pending Approval')}
                  </span>
                  <div className="bg-soft-gray rounded-xl p-3 text-xs text-warm-stone space-y-2">
                    <p className="text-deep-charcoal font-medium">{t('voiceSettings.waPendingHelpTitle', 'What happens next')}</p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>{t('voiceSettings.waPendingStep1', 'Meta reviews your number — usually takes 1–2 business days.')}</li>
                      <li>{t('voiceSettings.waPendingStep2', 'You can check the review status in Meta Business Manager (link below).')}</li>
                      <li>{t('voiceSettings.waPendingStep3', 'When approved, this page flips to "Connected" automatically.')}</li>
                    </ol>
                  </div>
                  <a href="https://business.facebook.com/" target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
                    {t('voiceSettings.waCheckMeta', 'Open Meta Business Manager')} &rarr;
                  </a>
                </div>
              ) : (
                <div className="space-y-3">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    {t('voiceSettings.waNotConfigured', 'Not Configured')}
                  </span>
                  {waStatus.meta.error && <p className="text-xs text-red-600">{waStatus.meta.error}</p>}
                  <div className="bg-soft-gray rounded-xl p-3 text-xs text-warm-stone space-y-2">
                    <p className="text-deep-charcoal font-medium">{t('voiceSettings.waSetupHelpTitle', 'How to connect WhatsApp')}</p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>{t('voiceSettings.waSetupStep1', 'Open Meta Business Manager with the Facebook account that owns your restaurant page.')}</li>
                      <li>{t('voiceSettings.waSetupStep2', 'Go to WhatsApp Accounts → Approve the connection request from Seatable.')}</li>
                      <li>{t('voiceSettings.waSetupStep3', 'Come back here — it flips to "Connected" in about a minute.')}</li>
                    </ol>
                    <p className="pt-1">
                      {t('voiceSettings.waSetupHelp', 'Stuck?')}{' '}
                      <a href="mailto:hello@seatable.one?subject=WhatsApp%20setup" className="text-burgundy hover:text-burgundy-dark underline underline-offset-2 font-medium">
                        hello@seatable.one
                      </a>
                    </p>
                  </div>
                  <a href="https://business.facebook.com/" target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
                    {t('voiceSettings.waCheckMeta', 'Open Meta Business Manager')} &rarr;
                  </a>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-warm-stone">{t('voiceSettings.waLoading', 'Loading WhatsApp connection status...')}</p>
          );

          const posTab = (
            <>
              <POSIntegrationPanel />
              <StripeConnectPanel />
            </>
          );
          const widgetTab = slug
            ? <BookingChannelsPanel slug={slug} />
            : <p className="text-sm text-warm-stone">{t('voiceSettings.widgetUnavailable', 'Your booking widget will appear here once your restaurant is set up.')}</p>;

          const tabs: SettingsTabDef[] = [
            { id: 'voice',     label: t('voiceSettings.tab.voice', 'Voice & language'), content: voiceTab },
            { id: 'phone',     label: t('voiceSettings.tab.phone', 'Phone'),            content: phoneTab },
            { id: 'whatsapp',  label: t('voiceSettings.tab.whatsapp', 'WhatsApp link'), content: whatsappTab },
            { id: 'pos',       label: t('voiceSettings.tab.pos', 'POS'),                content: posTab },
            { id: 'instagram', label: t('voiceSettings.tab.instagram', 'Instagram'),    content: <InstagramPanel /> },
            { id: 'widget',    label: t('voiceSettings.tab.widget', 'Booking widget'),  content: widgetTab },
          ];

          return <SettingsTabs tabs={tabs} hashKey="voice-settings" />;
        })()}

        <VoiceEngineSwitchModal isOpen={showEngineSwitchConfirm} engineSwitchTarget={engineSwitchTarget} onConfirm={confirmEngineSwitch} onClose={() => setShowEngineSwitchConfirm(false)} />
      </div>
    </DashboardLayout>
  );
}
