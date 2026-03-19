import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '../components/layout/DashboardLayout';
import ManagerNotificationsPanel from '../components/dashboard/ManagerNotificationsPanel';
import StaffingSettingsPanel from '../components/dashboard/StaffingSettingsPanel';
import DepositSettingsPanel from '../components/settings/DepositSettingsPanel';
import FeedbackSettingsPanel from '../components/dashboard/FeedbackSettingsPanel';
import { authFetch } from '../services/api';
import { useToast } from '../contexts/ToastContext';
import {
  useWhatsAppStatus,
  useWhatsAppStats,
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
        <div role="status" aria-label="Loading templates" className="animate-pulse space-y-3">
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
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { data: phoneData, isLoading } = useQuery({
    queryKey: ['whatsapp-phone-status'],
    queryFn: async () => {
      const res = await authFetch('/api/whatsapp-settings?action=phone_status');
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });

  const requestMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch('/api/whatsapp-settings?action=request_verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code_method: 'SMS', language: 'en' }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      setMessage({ type: data.success ? 'success' : 'error', text: data.message || data.error });
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
          {isVerified ? t('settings.verified') : (phone?.code_verification_status || 'Unknown').replace(/_/g, ' ')}
        </span>
      </div>

      {isExpired && (
        <div className="space-y-3">
          <p className="text-xs text-warm-stone">
            {t('settings.phoneVerExpired')}
          </p>
          <button
            type="button"
            onClick={() => requestMutation.mutate()}
            disabled={requestMutation.isPending}
            className="text-xs bg-soft-gray hover:bg-border-gray text-deep-charcoal px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {requestMutation.isPending ? t('settings.sendingSms') : t('settings.sendSmsCode')}
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
  const { t } = useTranslation();
  const toast = useToast();
  const { data: status, isLoading: statusLoading } = useWhatsAppStatus();
  const { data: stats, isLoading: statsLoading } = useWhatsAppStats();
  const saveMutation = useSaveWhatsAppSettings();
  const testMutation = useSendTestMessage();

  const [pendingEnabled, setPendingEnabled] = useState<boolean | null>(null);
  const [pendingPhone, setPendingPhone] = useState<string | null>(null);
  const [testPhone, setTestPhone] = useState('');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const currentEnabled = pendingEnabled ?? status?.enabled ?? false;
  const currentPhone = pendingPhone ?? status?.phone_number ?? '';
  const isDirty = pendingEnabled !== null || pendingPhone !== null;

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
    });
  };

  const handleTest = () => {
    if (!testPhone) return;
    setTestResult(null);
    testMutation.mutate(testPhone, {
      onSuccess: () => setTestResult({ success: true, message: t('settings.testMessageSent') }),
      onError: (err) => setTestResult({ success: false, message: (err as Error).message }),
    });
  };

  if (statusLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div role="status" aria-label="Loading" className="animate-spin rounded-full h-8 w-8 border-2 border-border-gray border-t-burgundy" />
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
              placeholder="+5511999999999"
              value={currentPhone}
              onChange={(e) => setPendingPhone(e.target.value)}
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
            <div role="status" aria-label="Loading statistics" className="animate-pulse flex gap-6">
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
          <div className="flex gap-3">
            <input
              type="tel"
              placeholder="+5511999999999"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              className="flex-1 px-3 py-2 border border-border-gray rounded-xl text-sm text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-whatsapp/40 focus:border-whatsapp"
              aria-label={t('settings.testPhoneNumber', 'Test phone number')}
            />
            <button
              onClick={handleTest}
              disabled={!testPhone || testMutation.isPending || !status?.api_configured}
              className={`px-5 py-2 rounded-xl text-sm font-semibold transition-colors ${
                testPhone && status?.api_configured
                  ? 'bg-whatsapp hover:bg-whatsapp/80 text-white'
                  : 'bg-border-gray text-muted-stone cursor-not-allowed'
              }`}
            >
              {testMutation.isPending ? t('settings.sendingTest') : t('settings.sendTest')}
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
          {testResult && (
            <p className={`text-sm mt-2 ${testResult.success ? 'text-rose-600' : 'text-red-600'}`}>
              {testResult.message}
            </p>
          )}
        </div>

        {/* Phone Verification */}
        <PhoneVerificationPanel />

        {/* WhatsApp Template Status */}
        <WhatsAppTemplateStatusPanel />

        {/* Manager Notifications */}
        <ManagerNotificationsPanel />

        {/* Staffing Ratios */}
        <StaffingSettingsPanel />

        {/* Reservation Deposits */}
        <DepositSettingsPanel />

        {/* Post-Visit Feedback */}
        <FeedbackSettingsPanel />
      </div>
    </DashboardLayout>
  );
}
