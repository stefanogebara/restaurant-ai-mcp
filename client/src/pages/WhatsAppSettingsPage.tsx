import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import DashboardLayout from '../components/layout/DashboardLayout';
import {
  useWhatsAppStatus,
  useWhatsAppStats,
  useSaveWhatsAppSettings,
  useSendTestMessage,
} from '../hooks/useWhatsAppSettings';

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
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-border-gray border-t-burgundy" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6 p-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-serif font-bold text-deep-charcoal">WhatsApp Integration</h1>
          <p className="text-sm text-stone-gray mt-1">
            Send reservation confirmations and chat with customers via WhatsApp.
          </p>
        </div>

        {/* Connection Status Card */}
        <div className="bg-white border border-border-gray rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-deep-charcoal uppercase tracking-wider">Connection Status</h2>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                status?.api_configured
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-amber-50 text-amber-700'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${status?.api_configured ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              {status?.api_configured ? 'API Connected' : 'API Not Configured'}
            </span>
          </div>
          {!status?.api_configured && (
            <p className="text-sm text-warm-stone">
              Set <code className="text-xs bg-soft-gray px-1.5 py-0.5 rounded">WHATSAPP_PHONE_NUMBER_ID</code> and{' '}
              <code className="text-xs bg-soft-gray px-1.5 py-0.5 rounded">WHATSAPP_ACCESS_TOKEN</code> in your environment variables.
            </p>
          )}
        </div>

        {/* Enable Toggle + Phone Card */}
        <div className="bg-white border border-border-gray rounded-2xl p-6 shadow-sm space-y-5">
          <h2 className="text-sm font-semibold text-deep-charcoal uppercase tracking-wider">{t('settings.title')}</h2>

          {/* Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-deep-charcoal">Enable WhatsApp</p>
              <p className="text-xs text-warm-stone">Send reservation confirmations via WhatsApp instead of SMS</p>
            </div>
            <button
              onClick={() => setPendingEnabled(!currentEnabled)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                currentEnabled ? 'bg-[#25D366]' : 'bg-[#D6D3D1]'
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
              Owner WhatsApp Number
            </label>
            <input
              id="wa-phone"
              type="tel"
              placeholder="+5511999999999"
              value={currentPhone}
              onChange={(e) => setPendingPhone(e.target.value)}
              className="w-full px-3 py-2 border border-border-gray rounded-xl text-sm text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-[#25D366]/40 focus:border-[#25D366]"
            />
            <p className="text-xs text-warm-stone mt-1">Used for wa.me link on your booking page</p>
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
            {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
          {saveMutation.isError && (
            <p className="text-sm text-red-600">{(saveMutation.error as Error).message}</p>
          )}
        </div>

        {/* wa.me Link Card */}
        {status?.wa_me_link && (
          <div className="bg-white border border-border-gray rounded-2xl p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-deep-charcoal uppercase tracking-wider mb-3">WhatsApp Link</h2>
            <div className="flex items-center gap-3">
              <a
                href={status.wa_me_link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[#25D366] hover:underline font-mono break-all"
              >
                {status.wa_me_link}
              </a>
              <button
                onClick={() => navigator.clipboard.writeText(status.wa_me_link || '')}
                className="flex-shrink-0 px-3 py-1.5 text-xs font-medium bg-soft-gray hover:bg-border-gray rounded-lg transition-colors text-stone-gray"
              >
                Copy
              </button>
            </div>
            <p className="text-xs text-warm-stone mt-2">
              Share this link with customers so they can message your restaurant directly.
            </p>
          </div>
        )}

        {/* Stats Card */}
        <div className="bg-white border border-border-gray rounded-2xl p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-deep-charcoal uppercase tracking-wider mb-4">Statistics</h2>
          {statsLoading ? (
            <div className="animate-pulse flex gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 w-28 bg-soft-gray rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-soft-gray rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-deep-charcoal">{stats?.active_sessions ?? 0}</p>
                <p className="text-xs text-warm-stone mt-1">Active Sessions</p>
              </div>
              <div className="bg-soft-gray rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-deep-charcoal">{stats?.total_sessions ?? 0}</p>
                <p className="text-xs text-warm-stone mt-1">Total Sessions</p>
              </div>
              <div className="bg-soft-gray rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-deep-charcoal">{stats?.messages_this_month ?? 0}</p>
                <p className="text-xs text-warm-stone mt-1">Messages (Month)</p>
              </div>
            </div>
          )}
        </div>

        {/* Test Message Card */}
        <div className="bg-white border border-border-gray rounded-2xl p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-deep-charcoal uppercase tracking-wider mb-3">Send Test Message</h2>
          <div className="flex gap-3">
            <input
              type="tel"
              placeholder="+5511999999999"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              className="flex-1 px-3 py-2 border border-border-gray rounded-xl text-sm text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-[#25D366]/40 focus:border-[#25D366]"
              aria-label="Test phone number"
            />
            <button
              onClick={handleTest}
              disabled={!testPhone || testMutation.isPending || !status?.api_configured}
              className={`px-5 py-2 rounded-xl text-sm font-semibold transition-colors ${
                testPhone && status?.api_configured
                  ? 'bg-[#25D366] hover:bg-[#20BD5A] text-white'
                  : 'bg-border-gray text-muted-stone cursor-not-allowed'
              }`}
            >
              {testMutation.isPending ? 'Sending...' : 'Send Test'}
            </button>
          </div>
          {testResult && (
            <p className={`text-sm mt-2 ${testResult.success ? 'text-emerald-600' : 'text-red-600'}`}>
              {testResult.message}
            </p>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
