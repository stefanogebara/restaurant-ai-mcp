import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '../components/layout/DashboardLayout';
import ManagerNotificationsPanel from '../components/dashboard/ManagerNotificationsPanel';
import FeedbackSettingsPanel from '../components/dashboard/FeedbackSettingsPanel';
import SurveySettingsPanel from '../components/dashboard/SurveySettingsPanel';
import AiPersonalityPanel from '../components/dashboard/AiPersonalityPanel';
import PhoneInput, { type CountryCode } from '../components/common/PhoneInput';
import { authFetch } from '../services/api';
import { useToast } from '../contexts/ToastContext';
import {
  useWhatsAppStatus,
  useWhatsAppStats,
  useWhatsAppTestMessageStatus,
  useSaveWhatsAppSettings,
  useSendTestMessage,
} from '../hooks/useWhatsAppSettings';

interface TemplateStatus {
  name: string;
  status: string;
  category: string;
}

const TEMPLATE_LABEL_KEYS: Record<string, string> = {
  seatable_feedback_request: 'settings.templateFeedback',
  seatable_reengagement: 'settings.templateReengagement',
  seatable_birthday: 'settings.templateBirthday',
  seatable_promotion: 'settings.templatePromotion',
};

const STATUS_STYLES: Record<string, string> = {
  APPROVED: 'bg-rose-50 text-rose-700',
  PENDING: 'bg-amber-50 text-amber-700',
  IN_REVIEW: 'bg-amber-50 text-amber-700',
  REJECTED: 'bg-red-50 text-red-700',
  PAUSED: 'bg-gray-100 text-gray-600',
};

const STATUS_DOT: Record<string, string> = {
  APPROVED: 'bg-rose-500',
  PENDING: 'bg-amber-500',
  IN_REVIEW: 'bg-amber-500',
  REJECTED: 'bg-red-500',
  PAUSED: 'bg-gray-400',
};

const TEST_STATUS_STYLES: Record<string, string> = {
  accepted: 'bg-amber-50 text-amber-700',
  sent: 'bg-amber-50 text-amber-700',
  delivered: 'bg-rose-50 text-rose-700',
  read: 'bg-emerald-50 text-emerald-700',
  failed: 'bg-red-50 text-red-700',
};

function normalizePhone(value: string) {
  return value.replace(/\D/g, '');
}

function formatCooldown(ms: number) {
  const totalSeconds = Math.max(1, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0 && seconds > 0) return `${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

function formatStatusLabel(status: string | null | undefined, t: (key: string, fallback: string) => string) {
  const normalized = String(status || 'accepted').toLowerCase();
  const fallback = normalized.charAt(0).toUpperCase() + normalized.slice(1).replace(/_/g, ' ');
  return t(`settings.testStatus.${normalized}`, fallback);
}

function formatStatusTime(iso: string | null | undefined, notYetLabel: string) {
  if (!iso) return notYetLabel;

  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return notYetLabel;

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

function WhatsAppTemplateStatusPanel() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ['whatsapp-template-status'],
    queryFn: async (): Promise<{ success: boolean; templates: TemplateStatus[]; missing_env?: boolean; message?: string }> => {
      const res = await authFetch('/api/whatsapp-settings?action=template_status');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const ALL_TEMPLATES = Object.keys(TEMPLATE_LABEL_KEYS);

  return (
    <div className="py-5">
      <h2 className="text-[13px] font-semibold uppercase tracking-widest text-[#111827] mb-4">{t('settings.messageTemplates')}</h2>

      {isLoading && (
        <div role="status" aria-label={t('settings.loadingTemplates', 'Loading templates')} className="animate-pulse space-y-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-8 bg-soft-gray rounded-lg" />)}
        </div>
      )}

      {!isLoading && data?.missing_env && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          <p className="font-medium mb-1">{t('settings.envMissing')}</p>
          <p>{data.message}</p>
          <p className="mt-2 text-xs text-amber-700">
            {t('whatsapp.contactSupport', 'Please contact support to complete your WhatsApp setup.')}
          </p>
        </div>
      )}

      {!isLoading && !data?.missing_env && (
        <div className="space-y-2">
          {ALL_TEMPLATES.map(name => {
            const template = data?.templates?.find(t => t.name === name);
            const status = template?.status || 'NOT_SUBMITTED';
            const dotClass = STATUS_DOT[status] || 'bg-gray-300';
            const badgeClass = STATUS_STYLES[status] || 'bg-gray-100 text-gray-600';
            return (
              <div key={name} className="flex items-center justify-between py-2 border-b border-border-gray last:border-0">
                <div>
                  <p className="text-sm font-medium text-deep-charcoal">{t(TEMPLATE_LABEL_KEYS[name])}</p>
                  <p className="text-xs text-warm-stone font-mono">{name}</p>
                </div>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${badgeClass}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
                  {t(`whatsapp.status.${status}`, status.replace(/_/g, ' ').toLowerCase())}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PhoneVerificationPanel() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Auto-dismiss success/error feedback after 5s so it doesn't linger across
  // the next interaction.
  useEffect(() => {
    if (!message) return undefined;
    const id = window.setTimeout(() => setMessage(null), 5000);
    return () => window.clearTimeout(id);
  }, [message]);

  const { data: phoneData, isLoading } = useQuery({
    queryKey: ['whatsapp-phone-status'],
    queryFn: async () => {
      const res = await authFetch('/api/whatsapp-settings?action=phone_status');
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });

  // Meta accepts a 2-char language hint for the verification SMS. Derive from
  // the active UI locale so a Brazilian owner gets a PT-BR SMS, not English.
  const verificationLanguage = i18n.language?.startsWith('pt')
    ? 'pt_BR'
    : i18n.language?.startsWith('es')
      ? 'es'
      : 'en';

  const requestMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch('/api/whatsapp-settings?action=request_verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code_method: 'SMS', language: verificationLanguage }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      setMessage({ type: data.success ? 'success' : 'error', text: data.message || data.error });
      // Meta's phone status flips to PENDING after a successful request — refresh.
      if (data.success) qc.invalidateQueries({ queryKey: ['whatsapp-phone-status'] });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async (verifyCode: string) => {
      const res = await authFetch('/api/whatsapp-settings?action=submit_verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: verifyCode }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setMessage({ type: 'success', text: t('settings.phoneVerified') });
        setCode('');
        qc.invalidateQueries({ queryKey: ['whatsapp-phone-status'] });
      } else {
        setMessage({ type: 'error', text: data.error });
      }
    },
  });

  const phone = phoneData?.phone;
  const isExpired = phone?.code_verification_status === 'EXPIRED';
  const isVerified = phone?.code_verification_status === 'VERIFIED';

  if (!phoneData?.configured || isLoading) return null;

  return (
    <div className="py-5">
      <h2 className="text-[13px] font-semibold uppercase tracking-widest text-[#111827] mb-4">{t('settings.phoneVerification')}</h2>

      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-medium text-deep-charcoal">{phone?.display_phone_number}</p>
          <p className="text-xs text-warm-stone">{phone?.verified_name}</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
          isVerified ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isVerified ? 'bg-rose-500' : 'bg-amber-500'}`} />
          {isVerified ? t('settings.verified') : String(t(`settings.phoneStatus.${phone?.code_verification_status}`, (phone?.code_verification_status || 'Unknown').replace(/_/g, ' ')))}
        </span>
      </div>

      {!isVerified && (
        <div className="space-y-3">
          <p className="text-xs text-warm-stone">
            {isExpired
              ? t('settings.phoneVerExpired')
              : t('settings.phoneVerPending', 'Your phone number is not yet verified. Request a verification code below.')}
          </p>
          <button
            type="button"
            onClick={() => requestMutation.mutate()}
            disabled={requestMutation.isPending}
            className="text-xs bg-soft-gray hover:bg-border-gray text-deep-charcoal px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {requestMutation.isPending ? t('settings.sendingSms') : t('settings.reverifyPhone', 'Verify Again')}
          </button>
          <div className="flex gap-2">
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder={t('settings.sixDigitCode')}
              className="flex-1 text-sm border border-border-gray rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-burgundy"
              maxLength={6}
            />
            <button
              type="button"
              onClick={() => verifyMutation.mutate(code)}
              disabled={code.length < 6 || verifyMutation.isPending}
              className="text-xs bg-burgundy text-white px-3 py-1.5 rounded-lg hover:bg-burgundy/90 transition-colors disabled:opacity-50"
            >
              {verifyMutation.isPending ? t('settings.verifying') : t('settings.verify')}
            </button>
          </div>
        </div>
      )}

      {message && (
        <p className={`text-xs mt-2 ${message.type === 'success' ? 'text-rose-600' : 'text-red-600'}`}>
          {message.text}
        </p>
      )}

      {!phone?.is_official_business_account && (
        <p className="text-xs text-warm-stone mt-3 pt-3 border-t border-border-gray">
          {t('settings.metaVerificationHint')}{' '}
          <a href="https://business.facebook.com" target="_blank" rel="noopener noreferrer" className="text-burgundy underline">
            {t('settings.metaBusinessVerification')}
          </a>.
        </p>
      )}
    </div>
  );
}

export default function WhatsAppSettingsPage() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const testPhoneDefaultCountry: CountryCode = i18n.language?.startsWith('es')
    ? 'ES'
    : i18n.language?.startsWith('en')
      ? 'US'
      : 'BR';
  const { data: status, isLoading: statusLoading } = useWhatsAppStatus();
  const { data: stats, isLoading: statsLoading } = useWhatsAppStats();
  const { data: latestTestMessage, isLoading: testStatusLoading } = useWhatsAppTestMessageStatus();
  const saveMutation = useSaveWhatsAppSettings();
  const testMutation = useSendTestMessage();

  const [pendingEnabled, setPendingEnabled] = useState<boolean | null>(null);
  const [pendingPhone, setPendingPhone] = useState<string | null>(null);
  const [testPhone, setTestPhone] = useState('');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [cooldownNowMs, setCooldownNowMs] = useState(() => Date.now());

  const currentEnabled = pendingEnabled ?? status?.enabled ?? false;
  const currentPhone = pendingPhone ?? status?.phone_number ?? '';
  const isDirty = pendingEnabled !== null || pendingPhone !== null;
  const notYetLabel = t('settings.notYet', 'Not yet');
  const latestTestPhoneDigits = normalizePhone(latestTestMessage?.recipient_phone || '');
  const currentTestPhoneDigits = normalizePhone(testPhone);
  const samePhoneCooldownExpiresAt = latestTestMessage?.cooldown_expires_at
    ? Date.parse(latestTestMessage.cooldown_expires_at)
    : Number.NaN;
  const samePhoneCooldownActive = Boolean(
    latestTestPhoneDigits
    && latestTestPhoneDigits === currentTestPhoneDigits
    && Number.isFinite(samePhoneCooldownExpiresAt)
    && samePhoneCooldownExpiresAt > cooldownNowMs
  );
  const samePhoneCooldownRemainingMs = samePhoneCooldownActive
    ? Math.max(0, samePhoneCooldownExpiresAt - cooldownNowMs)
    : 0;

  useEffect(() => {
    if (!samePhoneCooldownActive) return undefined;

    setCooldownNowMs(Date.now());
    const timer = window.setInterval(() => setCooldownNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [samePhoneCooldownActive, samePhoneCooldownExpiresAt]);

  // Auto-dismiss test-send result banner after 5s — otherwise the green
  // "Sent" message hangs around through the next interaction.
  useEffect(() => {
    if (!testResult) return undefined;
    const id = window.setTimeout(() => setTestResult(null), 5000);
    return () => window.clearTimeout(id);
  }, [testResult]);

  const handleSave = () => {
    const updates: { enabled?: boolean; phone_number?: string } = {};
    if (pendingEnabled !== null) updates.enabled = pendingEnabled;
    if (pendingPhone !== null) updates.phone_number = pendingPhone;

    saveMutation.mutate(updates, {
      onSuccess: () => {
        setPendingEnabled(null);
        setPendingPhone(null);
        toast.success(t('common.saved', 'Settings saved'));
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : t('common.saveFailed', 'Failed to save settings'));
      },
    });
  };

  const handleTest = () => {
    if (!testPhone) return;
    setTestResult(null);
    testMutation.mutate(testPhone, {
      onSuccess: (data) => setTestResult({ success: true, message: data.message || t('settings.testMessageSent') }),
      onError: (err) => setTestResult({ success: false, message: (err as Error).message }),
    });
  };

  if (statusLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div role="status" aria-label={t('common.loading', 'Loading')} className="animate-spin rounded-full h-8 w-8 border-2 border-border-gray border-t-burgundy" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto p-6 bg-white">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[#111827]">{t('settings.whatsApp')}</h1>
          <p className="text-sm text-[#9CA3AF] mt-1">
            {t('settings.whatsAppDesc')}
          </p>
        </div>

        {/* Connection Status */}
        <div className="py-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[13px] font-semibold uppercase tracking-widest text-[#111827]">{t('settings.connectionStatus')}</h2>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                status?.api_configured
                  ? 'bg-rose-50 text-rose-700'
                  : 'bg-amber-50 text-amber-700'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${status?.api_configured ? 'bg-rose-500' : 'bg-amber-500'}`} />
              {status?.api_configured ? t('settings.apiConnected') : t('settings.apiNotConfigured')}
            </span>
          </div>
          {!status?.api_configured && (
            <p className="text-sm text-warm-stone">
              {t('settings.whatsappSetupHint', 'Contact Seatable support to configure your WhatsApp connection.')}
            </p>
          )}
        </div>

        {/* Enable Toggle + Phone */}
        <div className="border-t border-[#E5E7EB] mt-8 mb-8" />
        <div className="py-5 space-y-5">
          <h2 className="text-[13px] font-semibold uppercase tracking-widest text-[#111827]">{t('settings.settings', 'Settings')}</h2>

          {/* Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-deep-charcoal">{t('settings.enableWhatsApp')}</p>
              <p className="text-xs text-warm-stone">{t('settings.enableWhatsAppDesc')}</p>
              {status?.api_configured && !currentEnabled && (
                <p className="text-xs text-amber-600 mt-1">
                  {t('settings.connectedButPaused', 'WhatsApp is connected but notifications are paused. Enable to start sending messages.')}
                </p>
              )}
            </div>
            <button
              onClick={() => setPendingEnabled(!currentEnabled)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                currentEnabled ? 'bg-whatsapp' : 'bg-stone-300'
              }`}
              aria-label={currentEnabled ? t('settings.disableWhatsApp', 'Disable WhatsApp') : t('settings.enableWhatsAppLabel', 'Enable WhatsApp')}
              role="switch"
              aria-checked={currentEnabled}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  currentEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Phone Number */}
          <div>
            <label htmlFor="wa-phone" className="block text-sm font-medium text-deep-charcoal mb-1">
              {t('settings.ownerWhatsAppNumber')}
            </label>
            <input
              id="wa-phone"
              type="tel"
              inputMode="tel"
              pattern="^\+?[0-9 ]*$"
              placeholder="+5511999999999"
              value={currentPhone}
              onChange={(e) => setPendingPhone(e.target.value.replace(/[^\d+ ]/g, ''))}
              className="w-full px-3 py-2 border border-border-gray rounded-xl text-sm text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-whatsapp/40 focus:border-whatsapp"
            />
            <p className="text-xs text-warm-stone mt-1">{t('settings.ownerWhatsAppHint')}</p>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={!isDirty || saveMutation.isPending}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              isDirty
                ? 'bg-burgundy hover:bg-burgundy-dark text-white'
                : 'bg-border-gray text-muted-stone cursor-not-allowed'
            }`}
          >
            {saveMutation.isPending ? t('common.loading') : t('common.save')}
          </button>
          {saveMutation.isError && (
            <p className="text-sm text-red-600">{(saveMutation.error as Error).message}</p>
          )}
        </div>

        {/* wa.me Link */}
        {status?.wa_me_link && (
          <>
          <div className="border-t border-[#E5E7EB] mt-8 mb-8" />
          <div className="py-5">
            <h2 className="text-[13px] font-semibold uppercase tracking-widest text-[#111827] mb-3">{t('settings.whatsAppLink')}</h2>
            <div className="flex items-center gap-3">
              <a
                href={status.wa_me_link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-whatsapp hover:underline font-mono break-all"
              >
                {status.wa_me_link}
              </a>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(status.wa_me_link || '');
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="flex-shrink-0 px-3 py-1.5 text-xs font-medium bg-soft-gray hover:bg-border-gray rounded-xl transition-colors text-stone-gray"
              >
                {copied ? t('common.copied', 'Copied!') : t('settings.copyLink')}
              </button>
            </div>
            <p className="text-xs text-warm-stone mt-2">
              {t('settings.shareLinkHint')}
            </p>
          </div>
          </>
        )}

        {/* Statistics */}
        <div className="border-t border-[#E5E7EB] mt-8 mb-8" />
        <div className="py-5">
          <h2 className="text-[13px] font-semibold uppercase tracking-widest text-[#111827] mb-4">{t('settings.statistics')}</h2>
          {statsLoading ? (
            <div role="status" aria-label={t('settings.loadingStatistics', 'Loading statistics')} className="animate-pulse flex gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 w-28 bg-soft-gray rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-soft-gray rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-deep-charcoal">{stats?.active_sessions ?? 0}</p>
                <p className="text-xs text-warm-stone mt-1">{t('settings.activeSessions')}</p>
              </div>
              <div className="bg-soft-gray rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-deep-charcoal">{stats?.total_sessions ?? 0}</p>
                <p className="text-xs text-warm-stone mt-1">{t('settings.totalSessions')}</p>
              </div>
              <div className="bg-soft-gray rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-deep-charcoal">{stats?.messages_this_month ?? 0}</p>
                <p className="text-xs text-warm-stone mt-1">{t('settings.messagesMonth')}</p>
              </div>
            </div>
          )}
        </div>

        {/* Test Message */}
        <div className="border-t border-[#E5E7EB] mt-8 mb-8" />
        <div className="py-5">
          <h2 className="text-[13px] font-semibold uppercase tracking-widest text-[#111827] mb-3">{t('settings.sendTestMessage')}</h2>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <PhoneInput
                value={testPhone}
                onChange={(fullNumber) => setTestPhone(fullNumber)}
                defaultCountry={testPhoneDefaultCountry}
                label={t('settings.testPhoneNumber', 'Test phone number')}
              />
            </div>
            <button
              onClick={handleTest}
              disabled={!testPhone || testMutation.isPending || !status?.api_configured || samePhoneCooldownActive}
              className={`px-5 py-2 rounded-xl text-sm font-semibold transition-colors ${
                testPhone && status?.api_configured && !samePhoneCooldownActive
                  ? 'bg-whatsapp hover:bg-whatsapp/80 text-white'
                  : 'bg-border-gray text-muted-stone cursor-not-allowed'
              }`}
            >
              {testMutation.isPending
                ? t('settings.sendingTest')
                : samePhoneCooldownActive
                  ? t('settings.retryIn', { time: formatCooldown(samePhoneCooldownRemainingMs), defaultValue: `Retry in ${formatCooldown(samePhoneCooldownRemainingMs)}` })
                  : t('settings.sendTest')}
            </button>
          </div>
          {!status?.api_configured && (
            <p className="text-xs text-amber-600 mt-2">
              {t('settings.testRequiresApi', 'WhatsApp API must be configured before sending test messages. Contact support to complete setup.')}
            </p>
          )}
          {status?.api_configured && !testPhone && (
            <p className="text-xs text-warm-stone mt-2">
              {t('settings.enterTestPhone', 'Enter a phone number above to send a test message.')}
            </p>
          )}
          {samePhoneCooldownActive && (
            <p className="text-xs text-amber-700 mt-2">
              {t('settings.testCooldownActive', {
                time: formatCooldown(samePhoneCooldownRemainingMs),
                defaultValue: `A recent test was already sent to this number. Wait ${formatCooldown(samePhoneCooldownRemainingMs)} before sending it again.`,
              })}
            </p>
          )}
          {testResult && (
            <p className={`text-sm mt-2 ${testResult.success ? 'text-rose-600' : 'text-red-600'}`}>
              {testResult.message}
            </p>
          )}
          {testStatusLoading && (
            <div className="mt-4 h-24 rounded-2xl bg-soft-gray animate-pulse" aria-label={t('settings.loadingTestDelivery', 'Loading test delivery status')} />
          )}
          {!testStatusLoading && latestTestMessage && (
            <div className="mt-4 rounded-2xl border border-[#E5E7EB] bg-soft-gray/60 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-[#6B7280]">
                    {t('settings.latestTestDelivery', 'Latest test delivery')}
                  </p>
                  <p className="mt-1 text-sm font-medium text-deep-charcoal">{latestTestMessage.recipient_phone}</p>
                  <p className="text-xs text-warm-stone">
                    {t('settings.providerLabel', 'Provider')}: {latestTestMessage.provider}
                  </p>
                </div>
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${TEST_STATUS_STYLES[latestTestMessage.status] || 'bg-gray-100 text-gray-600'}`}>
                  {formatStatusLabel(latestTestMessage.status, t)}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 text-xs text-warm-stone sm:grid-cols-2">
                <div>
                  <p className="font-medium text-deep-charcoal">{t('settings.requestedAt', 'Requested')}</p>
                  <p>{formatStatusTime(latestTestMessage.requested_at, notYetLabel)}</p>
                </div>
                <div>
                  <p className="font-medium text-deep-charcoal">{t('settings.lastStatusAt', 'Last status update')}</p>
                  <p>{formatStatusTime(latestTestMessage.status_updated_at, notYetLabel)}</p>
                </div>
                <div>
                  <p className="font-medium text-deep-charcoal">{t('settings.deliveredAt', 'Delivered')}</p>
                  <p>{formatStatusTime(latestTestMessage.delivered_at, notYetLabel)}</p>
                </div>
                <div>
                  <p className="font-medium text-deep-charcoal">{t('settings.readAt', 'Read')}</p>
                  <p>{formatStatusTime(latestTestMessage.read_at, notYetLabel)}</p>
                </div>
              </div>

              {(latestTestMessage.template_name || latestTestMessage.template_language) && (
                <p className="mt-3 text-xs text-warm-stone">
                  {t('settings.templateLabel', 'Template')}: {latestTestMessage.template_name || 'n/a'}
                  {latestTestMessage.template_language ? ` (${latestTestMessage.template_language})` : ''}
                </p>
              )}

              {latestTestMessage.error_message && (
                <p className="mt-3 text-xs text-red-600">{latestTestMessage.error_message}</p>
              )}
            </div>
          )}
        </div>

        {/* Phone Verification */}
        <PhoneVerificationPanel />

        {/* WhatsApp Template Status */}
        <WhatsAppTemplateStatusPanel />

        {/* AI Personality */}
        <AiPersonalityPanel />

        {/* Manager Notifications */}
        <ManagerNotificationsPanel />

        {/* Post-Visit Feedback */}
        <FeedbackSettingsPanel />

        {/* Satisfaction Survey */}
        <SurveySettingsPanel />
      </div>
    </DashboardLayout>
  );
}
