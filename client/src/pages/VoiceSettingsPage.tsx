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
import { useVoiceSettings, useSaveVoiceSettings, VoiceSettingsPartialSaveError } from '../hooks/useVoiceSettings';
import { useVoiceEngineSettings, useSaveVoiceEngine } from '../hooks/useVoiceEngineSettings';
import type { VoiceEngineSettings } from '../hooks/useVoiceEngineSettings';
import { useFeatureAccess } from '../hooks/useSubscription';
import UpgradePrompt from '../components/common/UpgradePrompt';
import ThiingsIcon from '../components/common/ThiingsIcon';
import { useVoiceBrowser } from '../hooks/useVoiceBrowser';
import { useAudioPlayback } from '../hooks/useAudioPlayback';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';

import type { SettingsTabDef } from '../components/common/SettingsTabs';
import VoiceSettingsTabs from '../components/voice/VoiceSettingsTabs';
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
import VoiceSetupNextStep from '../components/voice/VoiceSetupNextStep';
// AIStrategyPanel removed — dead feature
// StrategyMetricsWidget moved to insights-only (removed from voice settings)
import { authFetch, hostAPI } from '../services/api';

import { DEFAULT_VOICE_SETTINGS } from '../components/voice/voiceTypes';
import type { VoiceSettings } from '../components/voice/voiceTypes';
import { useWhatsAppIntegrationStatus } from '../hooks/useWhatsAppSettings';
import { useVoicePersona } from '../hooks/useVoicePersona';
import { getPreviewText } from '../components/voice/voiceConstants';

const voiceScrollBehavior = (): ScrollBehavior =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

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
  const { data: persona, isError: isPersonaError } = useVoicePersona({ enabled: canLoadVoiceData });
  const queryClient = useQueryClient();
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceBrowserRef = useRef<HTMLElement | null>(null);

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
  const [voiceSavePartial, setVoiceSavePartial] = useState(false);
  const [draftGreeting, setDraftGreeting] = useState<string | null>(null);
  const [draftAgentName, setDraftAgentName] = useState<string | null>(null);

  useEffect(() => {
    if (isBrowserOpen) voiceBrowserRef.current?.scrollIntoView?.({ behavior: voiceScrollBehavior(), block: 'start' });
  }, [isBrowserOpen]);

  // ─── Derived state ────────────────────────────────────────────────────────────

  const isSaving = saveMutation.isPending || saveEngineMutation.isPending;
  const isDirty = pendingVoiceId !== null || pendingSettings !== null || pendingLanguage !== null || pendingEngine !== null || pendingOpenAIVoice !== null;
  const hasPendingElevenLabsChanges = pendingVoiceId !== null || pendingSettings !== null || pendingLanguage !== null;
  const hasPendingEngineChanges = pendingEngine !== null || pendingOpenAIVoice !== null;
  const voiceReadbackUnavailable = config?.source === 'database_only';
  const voiceSavePaused = voiceReadbackUnavailable && hasPendingElevenLabsChanges;

  const currentEngine = pendingEngine || engineConfig?.voice_engine || 'elevenlabs';
  const currentOpenAIVoice = pendingOpenAIVoice || engineConfig?.openai_voice_id || 'alloy';
  const currentSettings: VoiceSettings = pendingSettings || config?.voice_settings || DEFAULT_VOICE_SETTINGS;
  const currentLanguage = pendingLanguage || config?.language || 'en';
  const currentVoiceId = pendingVoiceId || config?.voice_id || '';
  const savedGreeting = isPersonaError ? '' : persona?.agent_greeting?.trim() || '';
  const sampleText = draftGreeting !== null
    ? draftGreeting.trim()
    : savedGreeting || getPreviewText(currentLanguage, config?.restaurant_name || undefined);
  const sampleKind = draftGreeting !== null ? 'draft' : savedGreeting ? 'saved' : 'example';

  // ─── Voice browser ────────────────────────────────────────────────────────────

  const { voices, isLoadingVoices, isLoadingMore, hasMore, voicesSource, error: voiceBrowserError, refetch: refetchVoices, filters, setFilters, handleLoadMore } = useVoiceBrowser({
    isOpen: isBrowserOpen,
    language: currentLanguage,
    restaurantName: config?.restaurant_name || undefined,
  });

  const selectedBrowserVoice = voices.find(v => v.id === pendingVoiceId);

  // ─── Audio playback ───────────────────────────────────────────────────────────

  const { playingVoiceId, isSamplePlaying, loadingAudio, sampleDuration, sampleCurrentTime, seekSample, handlePlayVoice, handlePreviewWithSettings } = useAudioPlayback({
    voices,
    currentVoiceId,
    currentLanguage,
    restaurantName: config?.restaurant_name || undefined,
    currentSettings,
    sampleText,
  });

  // ─── Handlers ─────────────────────────────────────────────────────────────────

  const handleSettingChange = (key: keyof VoiceSettings, value: number) => {
    // Presets call this three times in one React event. Compose each change
    // from the previous pending value so batching cannot discard two fields.
    setPendingSettings(previous => ({ ...(previous ?? currentSettings), [key]: value }));
  };

  const handleVoiceSelection = (voiceId: string) => {
    setPendingVoiceId(voiceId);
    setIsBrowserOpen(false);
    window.scrollTo({ top: 0, behavior: 'auto' });
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
    const hasElevenLabsChanges = hasPendingElevenLabsChanges && !voiceReadbackUnavailable;
    const hasEngineChanges = hasPendingEngineChanges;
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
        onSuccess: () => {
          setVoiceSavePartial(false);
          // Clear this half's pending state regardless of the other half.
          setPendingVoiceId(null);
          setPendingSettings(null);
          setPendingLanguage(null);
          onAllComplete();
        },
        onError: (error) => {
          if (error instanceof VoiceSettingsPartialSaveError) {
            setVoiceSavePartial(true);
          } else {
            toast.error(t('voice.saveSettingsFailed', 'Failed to save voice settings'));
          }
        },
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
      <DashboardLayout appearance="hero">
        <div className="mx-auto max-w-[1120px] px-4 py-8 sm:px-8 lg:px-10" role="status" aria-label={t('voiceSettings.loadingAriaLabel', 'Loading voice settings')}>
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
  if (isConfigError) {
    return (
      <DashboardLayout appearance="hero">
        <div className="mx-auto max-w-[1120px] px-4 py-8 sm:px-8 lg:px-10">
          <div className="border-t border-brand-line py-12 sm:py-20">
            <div className="max-w-xl">
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-red-800">{t('voiceSettings.statusUnavailable', 'Status unavailable')}</p>
              <h2 className="font-brand text-[34px] leading-[1.04] tracking-[-0.05em] text-brand-ink sm:text-[46px]">{t('dashboard.errorTitle')}</h2>
              <p className="mb-6 mt-4 text-[15px] leading-6 text-brand-muted">{t('errors.serverError')}</p>
              <button
                type="button"
                onClick={() => refetchConfig()}
                className="inline-flex items-center gap-2 rounded-full bg-brand-action px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-action"
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
      <DashboardLayout appearance="hero">
        <div className="mx-auto max-w-[1120px] px-4 py-8 sm:px-8 lg:px-10">
          <div className="border-t border-brand-line py-12 sm:py-20">
            <div className="max-w-xl">
              {hasRestaurantName ? (
                <>
                  <div className="mb-5 flex items-center gap-3 text-amber-800">
                    <Spinner size="sm" className="border-amber-800 border-t-amber-800/30" />
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em]">{t('voiceSettings.setupInProgress', 'Setup in progress')}</span>
                  </div>
                  <h2 className="font-brand text-[34px] leading-[1.04] tracking-[-0.05em] text-brand-ink sm:text-[46px]">
                    {t('voice.agentCreating', 'Creating your voice agent...')}
                  </h2>
                  <p className="mb-6 mt-4 text-[15px] leading-6 text-brand-muted">
                    {t('voice.agentCreatingDesc', 'This may take up to 2 minutes. If the agent does not appear, try again below.')}
                  </p>
                  <button
                    type="button"
                    onClick={() => retryAgentMutation.mutate()}
                    disabled={retryAgentMutation.isPending}
                    className="inline-flex items-center gap-2 rounded-full bg-brand-action px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-ink disabled:cursor-not-allowed disabled:opacity-40"
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
                  <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-muted">{t('voiceSettings.setupRequired', 'Setup required')}</p>
                  <h2 className="font-brand text-[34px] leading-[1.04] tracking-[-0.05em] text-brand-ink sm:text-[46px]">{t('settings.noAgentConfigured')}</h2>
                  <p className="mb-6 mt-4 text-[15px] leading-6 text-brand-muted">
                    {t('settings.noAgentDesc')}
                  </p>
                  <a
                    href="/onboarding"
                    className="inline-flex items-center gap-2 rounded-full bg-brand-action px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-ink"
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
    <DashboardLayout appearance="hero">
      <div
        className="mx-auto max-w-[1120px] px-4 pb-28 pt-5 sm:px-8 lg:px-10"
        onFocusCapture={(event) => {
          if (window.innerWidth >= 640) return;
          const bottom = event.target.getBoundingClientRect().bottom;
          // Keep focused controls just above the 60px fixed navigation. A
          // larger offset needlessly pulls the script behind the menu button.
          const safeBottom = window.innerHeight - 68;
          if (bottom > safeBottom) window.scrollBy({ top: bottom - safeBottom, behavior: 'auto' });
        }}
      >
        <header className="mb-0 pb-0 sm:mb-3 sm:pb-2">
          <div className="flex items-end justify-between gap-3">
            <h1 className="sr-only font-brand font-normal leading-[1.05] tracking-[-0.045em] text-brand-ink sm:not-sr-only sm:text-[34px]">
              {t('voiceSettings.setupEyebrow', 'Reception')}
            </h1>
          </div>
        </header>

        {voiceSavePartial && !voiceReadbackUnavailable && (
          <div role="alert" className="mb-4 border-l-2 border-amber-700/70 py-1 pl-4 text-sm leading-5 text-amber-900 sm:flex sm:flex-wrap sm:items-center sm:gap-x-4">
            <strong className="shrink-0 font-semibold">{t('voiceSettings.partialSaveTitle', 'Not fully saved')}</strong>
            <p className="mt-1 max-w-[72ch] text-[13px] leading-5 sm:mt-0">{t('voiceSettings.partialSave', 'The agent accepted the change, but Seatable did not save it. Your edits remain here.')}</p>
            <button type="button" onClick={() => refetchConfig()} className="mt-2 w-fit shrink-0 font-semibold underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-900 sm:mt-0">
              {t('voiceSettings.retryLiveRead', 'Retry live settings')}
            </button>
          </div>
        )}

        {(() => {
          // Tabs split the previous wall-of-10-sections page into focused
          // panes. All panes stay mounted (hidden via Tailwind) so dirty
          // pending edits survive tab switches and the shared Save button
          // still saves everything in one shot.
          const renderCurrentVoice = (variant: 'identity' | 'control' | 'status') => (
            <VoiceCurrentCard
              variant={variant}
              surface="paper"
              agentName={isPersonaError ? undefined : (draftAgentName ?? persona?.agent_name)?.trim() || undefined}
              currentVoiceId={currentVoiceId}
              pendingVoiceId={pendingVoiceId}
              selectedBrowserVoice={selectedBrowserVoice}
              savedVoiceName={config.voice_name || voices.find(voice => voice.id === config.voice_id)?.name}
              currentLanguage={currentLanguage}
              sampleText={sampleText}
              sampleKind={sampleKind}
              isBrowserOpen={isBrowserOpen}
              loadingAudio={loadingAudio}
              isSamplePlaying={isSamplePlaying}
              sampleDuration={sampleDuration}
              sampleCurrentTime={sampleCurrentTime}
              onSeek={seekSample}
              onPlay={() => { if (sampleText) handlePreviewWithSettings(toast, sampleText); }}
              onToggleBrowser={() => setIsBrowserOpen(!isBrowserOpen)}
            />
          );
          const voiceTab = (
            <div className="space-y-3 sm:space-y-5">
              {isDirty && (voiceReadbackUnavailable || currentEngine !== 'elevenlabs') && !(voiceSavePaused && !hasPendingEngineChanges) && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving}
                    className="inline-flex min-h-10 items-center gap-2 rounded-full bg-brand-action px-5 py-2 text-[12px] font-semibold text-white hover:bg-brand-ink disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSaving && <Spinner size="sm" className="border-white border-t-white/30" />}
                    {isSaving ? t('voiceSettings.saving', 'Saving...') : t('voiceSettings.saveChanges', 'Save Changes')}
                  </button>
                </div>
              )}
              {currentEngine === 'elevenlabs' && voiceReadbackUnavailable && (
                <>
                  <VoicePersonaPanel variant="studio" readOnly readOnlyNotice={false} />
                  <section role="status" className="mx-auto mt-6 flex max-w-[960px] flex-wrap items-center justify-between gap-x-6 gap-y-2 border-l-2 border-amber-800 py-2 pl-4 font-brand">
                    <div className="max-w-[70ch]">
                      <h2 className="text-[13px] font-semibold leading-5 text-brand-ink">{t('voiceSettings.storedOnlyTitle', 'Live voice settings are unavailable')}</h2>
                      <p className="mt-1 text-[12px] leading-5 text-brand-muted">
                        {voiceSavePartial
                          ? t('voiceSettings.partialSave', 'The agent accepted the change, but Seatable did not save it. Your edits remain here.')
                          : t('dashboard.voicePersona.storedOnlyDisclaimer', 'Saved in Seatable; not verified on the voice agent.')}
                      </p>
                    </div>
                    <button type="button" onClick={() => refetchConfig()} className="min-h-10 w-fit shrink-0 text-[12px] font-semibold text-brand-action underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-action">
                      {t('voiceSettings.retryLiveRead', 'Retry live settings')}
                    </button>
                  </section>
                  <VoiceEngineSelector currentEngine={currentEngine} pendingEngine={pendingEngine} engineStatus={engineConfig?.voice_engine_status} onEngineSwitch={handleEngineSwitch} />
                </>
              )}
              {currentEngine === 'elevenlabs' && !voiceReadbackUnavailable && (
                <>
                  <div className="mx-auto min-w-0 max-w-[960px]">
                    <VoicePersonaPanel
                      variant="studio"
                      onGreetingDraftChange={setDraftGreeting}
                      onAgentNameDraftChange={setDraftAgentName}
                      exampleGreeting={getPreviewText(currentLanguage, config?.restaurant_name || undefined)}
                      voiceIdentity={renderCurrentVoice('identity')}
                      playControl={renderCurrentVoice('control')}
                      sampleStatus={renderCurrentVoice('status')}
                    />
                    <div className="mt-7 border-t border-brand-line sm:mt-9">
                      <div className="min-w-0 divide-y divide-brand-line/70">
                        <div className="min-w-0">
                          <VoiceTuningPanel
                            settings={currentSettings}
                            onSettingChange={handleSettingChange}
                            onReset={() => setPendingSettings({ ...DEFAULT_VOICE_SETTINGS })}
                          />
                        </div>
                        <div className="min-w-0">
                          <VoiceLanguagePicker currentLanguage={currentLanguage} savedLanguage={config?.language} onChange={setPendingLanguage} />
                        </div>
                        <div className="min-w-0 mt-5 sm:mt-0">
                          <VoiceEngineSelector currentEngine={currentEngine} pendingEngine={pendingEngine} engineStatus={engineConfig?.voice_engine_status} onEngineSwitch={handleEngineSwitch} compact />
                        </div>
                      </div>
                      {isDirty && <div role="status" className="flex flex-wrap items-center justify-between gap-3 border-t border-brand-line py-3 font-brand">
                        <span className="text-[12px] text-amber-800">{t('voiceSettings.pendingVoiceChanges', 'Voice changes not saved')}</span>
                        <button
                          type="button"
                          onClick={handleSave}
                          disabled={isSaving}
                          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-brand-action px-5 py-2 text-[12px] font-semibold text-white hover:bg-brand-ink disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isSaving && <Spinner size="sm" className="border-white border-t-white/30" />}
                          {isSaving ? t('voiceSettings.saving', 'Saving...') : t('voiceSettings.saveChanges', 'Save Changes')}
                        </button>
                      </div>}
                      <VoiceAgentInfo agentId={config.agent_id} updatedAt={config.agent_updated_at} createdAt={config.created_at} />
                    </div>
                  </div>
                  {isBrowserOpen && (
                    <section ref={voiceBrowserRef} className="scroll-mt-[88px] border-b border-brand-line py-5">
                      <h2 className="mb-4 flex items-center gap-2 font-brand text-[12px] font-semibold uppercase tracking-[0.14em] text-brand-muted">
                        <ThiingsIcon name="search" pxSize={20} />
                        {t('voiceSettings.voiceLibrary', 'Voice Library')}
                      </h2>
                      {voiceBrowserError ? (
                        <div className="border-l-2 border-red-700 py-2 pl-4 font-brand">
                          <p className="text-sm font-semibold text-brand-ink">
                            {t('voiceSettings.voiceLoadError', 'Could not load voices')}
                          </p>
                          <p className="mb-4 mt-1 text-xs text-brand-muted">
                            {t('voiceSettings.voiceLoadErrorHint', 'The voice service may be temporarily unavailable. Please try again.')}
                          </p>
                          <button
                            type="button"
                            onClick={() => refetchVoices()}
                            className="min-h-10 text-sm font-medium text-brand-action underline underline-offset-4 hover:text-brand-ink"
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
                            onSelectVoice={handleVoiceSelection}
                            onPlayVoice={handlePlayVoice}
                            onLoadMore={handleLoadMore}
                            isLoading={isLoadingVoices}
                            source={voicesSource}
                          />
                        </>
                      )}
                    </section>
                  )}
                </>
              )}

              {currentEngine === 'openai_realtime' && (
                <>
                  <OpenAIVoicePicker currentOpenAIVoice={currentOpenAIVoice} savedOpenAIVoice={engineConfig?.openai_voice_id} onSelect={setPendingOpenAIVoice} />
                  <VoiceEngineSelector currentEngine={currentEngine} pendingEngine={pendingEngine} engineStatus={engineConfig?.voice_engine_status} onEngineSwitch={handleEngineSwitch} />
                  <VoicePersonaPanel engine="openai_realtime" />
                  <OpenAIEngineInfo engineStatus={engineConfig?.voice_engine_status} currentOpenAIVoice={currentOpenAIVoice} />
                </>
              )}
            </div>
          );

          const phoneTab = <><VoiceSetupNextStep /><PhoneIntegrationPanel /></>;

          const whatsappTab = waStatus ? (
            <div>
              <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone mb-3">
                {t('voiceSettings.whatsappStatus', 'WhatsApp Status')}
              </h2>
              {waStatus.meta.approved ? (
                <div className="space-y-1">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-100 text-xs font-medium text-emerald-800">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
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
                  <a href="https://business.facebook.com/" target="_blank" rel="noreferrer" className="text-xs text-burgundy hover:underline inline-flex items-center gap-1">
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
                  <a href="https://business.facebook.com/" target="_blank" rel="noreferrer" className="text-xs text-burgundy hover:underline inline-flex items-center gap-1">
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

          return <VoiceSettingsTabs tabs={tabs} />;
        })()}

        <VoiceEngineSwitchModal isOpen={showEngineSwitchConfirm} engineSwitchTarget={engineSwitchTarget} onConfirm={confirmEngineSwitch} onClose={() => setShowEngineSwitchConfirm(false)} />
      </div>
    </DashboardLayout>
  );
}
