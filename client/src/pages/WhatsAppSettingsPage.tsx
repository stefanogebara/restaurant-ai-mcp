import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import DashboardLayout from '../components/layout/DashboardLayout';
import ManagerNotificationsPanel from '../components/dashboard/ManagerNotificationsPanel';
import StaffingSettingsPanel from '../components/dashboard/StaffingSettingsPanel';
import DepositSettingsPanel from '../components/settings/DepositSettingsPanel';
import FeedbackSettingsPanel from '../components/dashboard/FeedbackSettingsPanel';
import { authFetch } from '../services/api';
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

const TEMPLATE_LABELS: Record<string, string> = {
  seatable_feedback_request: 'Feedback Request',
  seatable_reengagement: 'Re-engagement',
  seatable_birthday: 'Birthday Greeting',
  seatable_promotion: 'Promotion',
};

const STATUS_STYLES: Record<string, string> = {
  APPROVED: 'bg-emerald-50 text-emerald-700',
  PENDING: 'bg-amber-50 text-amber-700',
  IN_REVIEW: 'bg-amber-50 text-amber-700',
  REJECTED: 'bg-red-50 text-red-700',
  PAUSED: 'bg-gray-100 text-gray-600',
};

const STATUS_DOT: Record<string, string> = {
  APPROVED: 'bg-emerald-500',
  PENDING: 'bg-amber-500',
  IN_REVIEW: 'bg-amber-500',
  REJECTED: 'bg-red-500',
  PAUSED: 'bg-gray-400',
};

function WhatsAppTemplateStatusPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['whatsapp-template-status'],
    queryFn: async (): Promise<{ success: boolean; templates: TemplateStatus[]; missing_env?: boolean; message?: string }> => {
      const res = await authFetch('/whatsapp-settings?action=template_status');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const ALL_TEMPLATES = Object.keys(TEMPLATE_LABELS);

  return (
    <div className="bg-white border border-border-gray rounded-2xl p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-deep-charcoal uppercase tracking-wider mb-4">Message Templates</h2>

      {isLoading && (
        <div role="status" aria-label="Loading templates" className="animate-pulse space-y-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-8 bg-soft-gray rounded-lg" />)}
        </div>
      )}

      {!isLoading && data?.missing_env && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          <p className="font-medium mb-1">Environment variable missing</p>
          <p>{data.message}</p>
          <p className="mt-2 text-xs text-amber-700">
            Add <code className="bg-amber-100 px-1 rounded">WHATSAPP_WABA_ID</code> to your Vercel project settings,
            then redeploy.
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
                  <p className="text-sm font-medium text-deep-charcoal">{TEMPLATE_LABELS[name]}</p>
                  <p className="text-xs text-warm-stone font-mono">{name}</p>
                </div>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${badgeClass}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
                  {status.replace(/_/g, ' ')}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function WhatsAppSettingsPage() {
  const { t } = useTranslation();
  const { data: status, isLoading: statusLoading } = useWhatsAppStatus();
  const { data: stats, isLoading: statsLoading } = useWhatsAppStats();
  const saveMutation = useSaveWhatsAppSettings();
  const testMutation = useSendTestMessage();

  const [pendingEnabled, setPendingEnabled] = useState<boolean | null>(null);
  const [pendingPhone, setPendingPhone] = useState<string | null>(null);
  const [testPhone, setTestPhone] = useState('');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

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
      },
    });
  };

  const handleTest = () => {
    if (!testPhone) return;
    setTestResult(null);
    testMutation.mutate(testPhone, {
      onSuccess: () => setTestResult({ success: true, message: 'Test message sent!' }),
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
      <div className="max-w-3xl mx-auto space-y-6 p-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-serif font-bold text-deep-charcoal">{t('settings.whatsApp')}</h1>
          <p className="text-sm text-stone-gray mt-1">
            {t('settings.whatsAppDesc')}
          </p>
        </div>

        {/* Connection Status Card */}
        <div className="bg-white border border-border-gray rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-deep-charcoal uppercase tracking-wider">{t('settings.connectionStatus')}</h2>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                status?.api_configured
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-amber-50 text-amber-700'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${status?.api_configured ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              {status?.api_configured ? t('settings.apiConnected') : t('settings.apiNotConfigured')}
            </span>
          </div>
          {!status?.api_configured && (
            <p className="text-sm text-warm-stone">
              {t('settings.whatsappSetupHint', 'Contact Seatable support to configure your WhatsApp connection.')}
            </p>
          )}
        </div>

        {/* Enable Toggle + Phone Card */}
        <div className="bg-white border border-border-gray rounded-2xl p-6 shadow-sm space-y-5">
          <h2 className="text-sm font-semibold text-deep-charcoal uppercase tracking-wider">{t('settings.settings', 'Settings')}</h2>

          {/* Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-deep-charcoal">{t('settings.enableWhatsApp')}</p>
              <p className="text-xs text-warm-stone">{t('settings.enableWhatsAppDesc')}</p>
            </div>
            <button
              onClick={() => setPendingEnabled(!currentEnabled)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                currentEnabled ? 'bg-whatsapp' : 'bg-stone-300'
              }`}
              aria-label={currentEnabled ? 'Disable WhatsApp' : 'Enable WhatsApp'}
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

        {/* wa.me Link Card */}
        {status?.wa_me_link && (
          <div className="bg-white border border-border-gray rounded-2xl p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-deep-charcoal uppercase tracking-wider mb-3">{t('settings.whatsAppLink')}</h2>
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
                onClick={() => navigator.clipboard.writeText(status.wa_me_link || '')}
                className="flex-shrink-0 px-3 py-1.5 text-xs font-medium bg-soft-gray hover:bg-border-gray rounded-xl transition-colors text-stone-gray"
              >
                {t('settings.copyLink')}
              </button>
            </div>
            <p className="text-xs text-warm-stone mt-2">
              {t('settings.shareLinkHint')}
            </p>
          </div>
        )}

        {/* Stats Card */}
        <div className="bg-white border border-border-gray rounded-2xl p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-deep-charcoal uppercase tracking-wider mb-4">{t('settings.statistics')}</h2>
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

        {/* Test Message Card */}
        <div className="bg-white border border-border-gray rounded-2xl p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-deep-charcoal uppercase tracking-wider mb-3">{t('settings.sendTestMessage')}</h2>
          <div className="flex gap-3">
            <input
              type="tel"
              placeholder="+5511999999999"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              className="flex-1 px-3 py-2 border border-border-gray rounded-xl text-sm text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-whatsapp/40 focus:border-whatsapp"
              aria-label="Test phone number"
            />
            <button
              onClick={handleTest}
              disabled={!testPhone || testMutation.isPending || !status?.api_configured}
              className={`px-5 py-2 rounded-xl text-sm font-semibold transition-colors ${
                testPhone && status?.api_configured
                  ? 'bg-whatsapp hover:bg-spotify text-white'
                  : 'bg-border-gray text-muted-stone cursor-not-allowed'
              }`}
            >
              {testMutation.isPending ? t('settings.sendingTest') : t('settings.sendTest')}
            </button>
          </div>
          {testResult && (
            <p className={`text-sm mt-2 ${testResult.success ? 'text-emerald-600' : 'text-red-600'}`}>
              {testResult.message}
            </p>
          )}
        </div>

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
