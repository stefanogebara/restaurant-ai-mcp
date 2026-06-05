/**
 * APIKeysPanel
 *
 * Create/revoke API keys for POS integration.
 * Shows key prefix + created + last used. Copy key on creation (shown once).
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAPIKeys, useCreateAPIKey, useRevokeAPIKey } from '../../hooks/useAPIKeys';
import type { APIKey } from '../../hooks/useAPIKeys';

export default function APIKeysPanel() {
  const { t } = useTranslation();
  const { data: keys, isLoading } = useAPIKeys();
  const createMutation = useCreateAPIKey();
  const revokeMutation = useRevokeAPIKey();

  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCreate = async () => {
    if (!newKeyName.trim()) return;
    try {
      const result = await createMutation.mutateAsync({ name: newKeyName.trim() });
      setCreatedKey(result.api_key);
      setNewKeyName('');
      setShowCreate(false);
    } catch {
      // Error handled by mutation
    }
  };

  const handleRevoke = async (key: APIKey) => {
    if (!window.confirm(t('integrations.revokeConfirm', `Revoke API key "${key.name}"? This cannot be undone.`))) return;
    try {
      await revokeMutation.mutateAsync(key.id);
    } catch {
      // Error handled by mutation
    }
  };

  const handleCopyKey = () => {
    if (!createdKey) return;
    navigator.clipboard.writeText(createdKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '--';
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-semibold uppercase tracking-widest text-[#111827]">
          {t('integrations.apiKeys', 'API Keys')}
        </h2>
        <button
          type="button"
          onClick={() => setShowCreate(!showCreate)}
          className="px-3 py-1.5 text-xs font-medium bg-[#1C1917] text-white rounded-lg hover:bg-[#292524] transition-colors"
        >
          {t('integrations.createKey', 'Create Key')}
        </button>
      </div>

      <p className="text-xs text-[#706A65]">
        {t('integrations.apiKeysDescription', 'Use API keys to authenticate POS systems and external integrations.')}
      </p>

      {/* Created key banner (shown once) */}
      {createdKey && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
          <p className="text-xs font-medium text-amber-800">
            {t('integrations.keyCreatedWarning', 'Save this key now. It will not be shown again.')}
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-white px-3 py-2 rounded-lg border border-amber-200 font-mono break-all">
              {createdKey}
            </code>
            <button
              type="button"
              onClick={handleCopyKey}
              className="px-3 py-2 text-xs font-medium bg-[#1C1917] text-white rounded-lg hover:bg-[#292524] transition-colors flex-shrink-0"
            >
              {copied ? t('common.copied', 'Copied!') : t('common.copy', 'Copy')}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setCreatedKey(null)}
            className="text-xs text-amber-700 underline"
          >
            {t('integrations.dismissKeyBanner', 'I have saved the key')}
          </button>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="border border-glass-border-dark rounded-xl p-4 space-y-3">
          <label className="block text-xs font-medium text-[#1C1917]">
            {t('integrations.keyName', 'Key Name')}
          </label>
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder={t('integrations.keyNamePlaceholder', 'e.g. POS Terminal 1')}
            className="w-full px-3 py-2 text-sm border border-glass-border-input rounded-lg focus:outline-none focus:ring-1 focus:ring-[#9F1239]"
            maxLength={100}
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => { setShowCreate(false); setNewKeyName(''); }}
              className="px-3 py-1.5 text-xs text-[#706A65] hover:text-[#1C1917] transition-colors"
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={!newKeyName.trim() || createMutation.isPending}
              className="px-4 py-1.5 text-xs font-medium bg-[#1C1917] text-white rounded-lg hover:bg-[#292524] disabled:opacity-50 transition-colors"
            >
              {createMutation.isPending
                ? t('common.loading', 'Loading...')
                : t('integrations.generate', 'Generate')}
            </button>
          </div>
          {createMutation.isError && (
            <p className="text-xs text-red-600">{createMutation.error?.message}</p>
          )}
        </div>
      )}

      {/* Keys list */}
      {isLoading ? (
        <p className="text-xs text-[#706A65]">{t('common.loading', 'Loading...')}</p>
      ) : !keys || keys.length === 0 ? (
        <p className="text-xs text-[#706A65] py-4 text-center border border-dashed border-glass-border-dark rounded-xl">
          {t('integrations.noApiKeys', 'No API keys yet. Create one to get started.')}
        </p>
      ) : (
        <div className="divide-y divide-[#E5E7EB] border border-glass-border-dark rounded-xl overflow-hidden">
          {keys.map((key) => (
            <div key={key.id} className="px-4 py-3 flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-[#1C1917]">{key.name}</p>
                <p className="text-xs text-[#706A65] font-mono">
                  {key.key_prefix}...
                  <span className="ml-3 font-sans">
                    {t('integrations.created', 'Created')} {formatDate(key.created_at)}
                  </span>
                  {key.last_used_at && (
                    <span className="ml-3 font-sans">
                      {t('integrations.lastUsed', 'Last used')} {formatDate(key.last_used_at)}
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleRevoke(key)}
                disabled={revokeMutation.isPending}
                className="px-3 py-1 text-xs text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors"
              >
                {t('integrations.revoke', 'Revoke')}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
