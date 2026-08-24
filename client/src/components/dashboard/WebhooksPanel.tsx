/**
 * WebhooksPanel
 *
 * Add/delete webhook URLs. Select events to subscribe to.
 * Test webhook button. Show failure count.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWebhooks, useCreateWebhook, useDeleteWebhook, useTestWebhook } from '../../hooks/useWebhooks';
import type { Webhook } from '../../hooks/useWebhooks';

export default function WebhooksPanel() {
  const { t } = useTranslation();
  const { data, isLoading } = useWebhooks();
  const createMutation = useCreateWebhook();
  const deleteMutation = useDeleteWebhook();
  const testMutation = useTestWebhook();

  const [showCreate, setShowCreate] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>(['*']);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [testResult, setTestResult] = useState<{ id: string; message: string; success: boolean } | null>(null);

  const webhooks = data?.webhooks || [];
  const availableEvents = data?.available_events || [];

  const handleCreate = async () => {
    if (!newUrl.trim()) return;
    try {
      const result = await createMutation.mutateAsync({
        url: newUrl.trim(),
        events: selectedEvents,
      });
      setCreatedSecret(result.webhook.secret);
      setNewUrl('');
      setSelectedEvents(['*']);
      setShowCreate(false);
    } catch {
      // Error handled by mutation
    }
  };

  const handleDelete = async (webhook: Webhook) => {
    if (!window.confirm(t('integrations.deleteWebhookConfirm', `Delete webhook for "${webhook.url}"?`))) return;
    try {
      await deleteMutation.mutateAsync(webhook.id);
    } catch {
      // Error handled by mutation
    }
  };

  const handleTest = async (webhookId: string) => {
    try {
      const result = await testMutation.mutateAsync(webhookId);
      setTestResult({ id: webhookId, message: result.message, success: result.success });
      setTimeout(() => setTestResult(null), 5000);
    } catch {
      setTestResult({ id: webhookId, message: 'Failed to send test', success: false });
    }
  };

  const handleCopySecret = () => {
    if (!createdSecret) return;
    navigator.clipboard.writeText(createdSecret).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const toggleEvent = (event: string) => {
    if (event === '*') {
      setSelectedEvents(['*']);
      return;
    }
    const withoutWildcard = selectedEvents.filter((e) => e !== '*');
    const updated = withoutWildcard.includes(event)
      ? withoutWildcard.filter((e) => e !== event)
      : [...withoutWildcard, event];
    setSelectedEvents(updated.length === 0 ? ['*'] : updated);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '--';
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone">
          {t('integrations.webhooks', 'Webhooks')}
        </h2>
        <button
          type="button"
          onClick={() => setShowCreate(!showCreate)}
          className="px-3 py-1.5 text-xs font-medium bg-[#1C1917] text-white rounded-lg hover:bg-[#292524] transition-colors"
        >
          {t('integrations.addWebhook', 'Add Webhook')}
        </button>
      </div>

      <p className="text-xs text-[#706A65]">
        {t('integrations.webhooksDescription', 'Receive real-time notifications when events happen in your restaurant.')}
      </p>

      {/* Created secret banner */}
      {createdSecret && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
          <p className="text-xs font-medium text-amber-800">
            {t('integrations.secretWarning', 'Save this signing secret now. It will not be shown again.')}
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-white px-3 py-2 rounded-lg border border-amber-200 font-mono break-all">
              {createdSecret}
            </code>
            <button
              type="button"
              onClick={handleCopySecret}
              className="px-3 py-2 text-xs font-medium bg-[#1C1917] text-white rounded-lg hover:bg-[#292524] transition-colors flex-shrink-0"
            >
              {copied ? t('common.copied', 'Copied!') : t('common.copy', 'Copy')}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setCreatedSecret(null)}
            className="text-xs text-amber-700 underline"
          >
            {t('integrations.dismissSecretBanner', 'I have saved the secret')}
          </button>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="border border-glass-border-dark rounded-xl p-4 space-y-3">
          <label className="block text-xs font-medium text-[#1C1917]">
            {t('integrations.webhookUrl', 'Webhook URL')}
          </label>
          <input
            type="url"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="https://your-server.com/webhook"
            className="w-full px-3 py-2 text-sm border border-glass-border-input rounded-lg focus:outline-none focus:ring-1 focus:ring-[#9F1239]"
          />

          <label className="block text-xs font-medium text-[#1C1917] mt-2">
            {t('integrations.events', 'Events')}
          </label>
          <div className="flex flex-wrap gap-2">
            {availableEvents.map((event) => (
              <button
                key={event}
                type="button"
                onClick={() => toggleEvent(event)}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                  selectedEvents.includes(event)
                    ? 'bg-[#1C1917] text-white border-[#1C1917]'
                    : 'bg-white/60 text-[#706A65] border-glass-border-dark hover:border-[#1C1917]'
                }`}
              >
                {event === '*' ? t('integrations.allEvents', 'All Events') : event}
              </button>
            ))}
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={() => { setShowCreate(false); setNewUrl(''); setSelectedEvents(['*']); }}
              className="px-3 py-1.5 text-xs text-[#706A65] hover:text-[#1C1917] transition-colors"
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={!newUrl.trim() || createMutation.isPending}
              className="px-4 py-1.5 text-xs font-medium bg-[#1C1917] text-white rounded-lg hover:bg-[#292524] disabled:opacity-50 transition-colors"
            >
              {createMutation.isPending
                ? t('common.loading', 'Loading...')
                : t('integrations.createWebhook', 'Create')}
            </button>
          </div>
          {createMutation.isError && (
            <p className="text-xs text-red-600">{createMutation.error?.message}</p>
          )}
        </div>
      )}

      {/* Webhooks list */}
      {isLoading ? (
        <p className="text-xs text-[#706A65]">{t('common.loading', 'Loading...')}</p>
      ) : webhooks.length === 0 ? (
        <p className="text-xs text-[#706A65] py-4 text-center border border-dashed border-glass-border-dark rounded-xl">
          {t('integrations.noWebhooks', 'No webhooks configured. Add one to receive event notifications.')}
        </p>
      ) : (
        <div className="divide-y divide-[#E5E7EB] border border-glass-border-dark rounded-xl overflow-hidden">
          {webhooks.map((wh) => (
            <div key={wh.id} className="px-4 py-3 space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-[#1C1917] truncate max-w-[60%]">{wh.url}</p>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => handleTest(wh.id)}
                    disabled={testMutation.isPending}
                    className="px-3 py-1 text-xs text-[#1C1917] hover:bg-[#F5F5F4] rounded-lg transition-colors"
                  >
                    {t('integrations.test', 'Test')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(wh)}
                    disabled={deleteMutation.isPending}
                    className="px-3 py-1 text-xs text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    {t('common.delete', 'Delete')}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs text-[#706A65]">
                <span>{wh.events.includes('*') ? t('integrations.allEvents', 'All Events') : wh.events.join(', ')}</span>
                {wh.last_triggered_at && (
                  <span>{t('integrations.lastTriggered', 'Last triggered')} {formatDate(wh.last_triggered_at)}</span>
                )}
                {wh.failure_count > 0 && (
                  <span className="text-red-600 font-medium">
                    {wh.failure_count} {t('integrations.failures', 'failures')}
                  </span>
                )}
              </div>

              {/* Test result inline */}
              {testResult?.id === wh.id && (
                <p className={`text-xs ${testResult.success ? 'text-green-600' : 'text-red-600'}`}>
                  {testResult.message}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
