import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { authFetch } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';

interface POSConnection {
  id: string;
  pos_provider: string;
  merchant_id: string | null;
  location_id: string | null;
  status: string;
  last_sync_at: string | null;
  sync_error: string | null;
  created_at: string;
}

interface POSStatus {
  connection: POSConnection | null;
  menu_items_count: number;
}

const POS_ERROR_MESSAGES: Record<string, string> = {
  not_configured: 'Square integration is not yet enabled. Contact hello@seatable.one.',
  denied: 'Square authorization was denied.',
  invalid_callback: 'Invalid OAuth callback. Please try again.',
  invalid_state: 'Security validation failed. Please try again.',
  token_failed: 'Failed to exchange authorization code. Please try again.',
  db_error: 'Connection saved but encountered a database error.',
  server_error: 'An unexpected error occurred. Please try again.',
};

export default function POSIntegrationPanel() {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();

  // Handle OAuth callback result params in the URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const posError = params.get('pos_error');
    const posConnected = params.get('pos_connected');

    if (posConnected === '1') {
      toast.success(t('pos.connectSuccess', 'Square connected successfully!'));
      queryClient.invalidateQueries({ queryKey: ['pos-status'] });
      // Clean up URL params
      const url = new URL(window.location.href);
      url.searchParams.delete('pos_connected');
      window.history.replaceState({}, '', url.toString());
    } else if (posError) {
      const msg = POS_ERROR_MESSAGES[posError] || 'Square connection failed. Please try again.';
      toast.error(msg);
      const url = new URL(window.location.href);
      url.searchParams.delete('pos_error');
      window.history.replaceState({}, '', url.toString());
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: posStatus, isLoading } = useQuery<POSStatus | null>({
    queryKey: ['pos-status'],
    queryFn: async () => {
      const res = await authFetch('/api/square/sync?action=status');
      if (!res.ok) return null;
      const data = await res.json();
      return data.success ? data : null;
    },
    staleTime: 60_000,
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch('/api/square/sync?action=catalog', { method: 'POST' });
      if (!res.ok) throw new Error('Sync failed');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['pos-status'] });
      toast.success(data.message || t('pos.syncSuccess', 'Menu synced successfully'));
    },
    onError: () => {
      toast.error(t('pos.syncFailed', 'Menu sync failed. Please try again.'));
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch('/api/square/sync?action=disconnect', { method: 'POST' });
      if (!res.ok) throw new Error('Disconnect failed');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos-status'] });
      toast.success(t('pos.disconnectSuccess', 'Square disconnected'));
    },
    onError: () => {
      toast.error(t('pos.disconnectFailed', 'Failed to disconnect. Please try again.'));
    },
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch('/api/square/auth');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to start Square authorization');
      }
      const data = await res.json();
      if (!data.url) throw new Error('No authorization URL returned');
      return data.url as string;
    },
    onSuccess: (url) => {
      window.location.href = url;
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : t('pos.connectFailed', 'Failed to connect Square'));
    },
  });

  const connection = posStatus?.connection;
  const isConnected = connection?.status === 'active';

  const handleConnect = () => {
    connectMutation.mutate();
  };

  const handleDisconnect = () => {
    if (!confirm(t('pos.confirmDisconnect', 'Are you sure you want to disconnect Square?'))) return;
    disconnectMutation.mutate();
  };

  return (
    <div className="py-5 border-t border-[#E5E7EB] mt-8">
      <h2 className="text-[13px] font-semibold uppercase tracking-widest text-[#111827] mb-3">
        {t('pos.title', 'POS Integration')}
      </h2>

      {isLoading ? (
        <div className="text-sm text-muted-stone">{t('common.loading', 'Loading...')}</div>
      ) : isConnected ? (
        <div className="space-y-4">
          {/* Connected status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                {t('pos.connected', 'Square Connected')}
              </span>
            </div>
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={disconnectMutation.isPending}
              className="text-xs text-red-600 hover:underline"
            >
              {t('pos.disconnect', 'Disconnect')}
            </button>
          </div>

          {/* Details */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            {connection?.merchant_id && (
              <div>
                <span className="text-muted-stone text-xs">{t('pos.merchantId', 'Merchant')}</span>
                <p className="text-deep-charcoal text-xs font-mono truncate">{connection.merchant_id}</p>
              </div>
            )}
            {connection?.location_id && (
              <div>
                <span className="text-muted-stone text-xs">{t('pos.locationId', 'Location')}</span>
                <p className="text-deep-charcoal text-xs font-mono truncate">{connection.location_id}</p>
              </div>
            )}
            <div>
              <span className="text-muted-stone text-xs">{t('pos.menuItems', 'Menu Items')}</span>
              <p className="text-deep-charcoal text-sm font-semibold">{posStatus?.menu_items_count || 0}</p>
            </div>
            {connection?.last_sync_at && (
              <div>
                <span className="text-muted-stone text-xs">{t('pos.lastSync', 'Last Sync')}</span>
                <p className="text-deep-charcoal text-xs">
                  {new Date(connection.last_sync_at).toLocaleString()}
                </p>
              </div>
            )}
          </div>

          {connection?.sync_error && (
            <p className="text-xs text-red-600 bg-red-50 p-2 rounded-lg">{connection.sync_error}</p>
          )}

          {/* Sync button */}
          <button
            type="button"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="px-4 py-2 border border-[#E5E7EB] rounded-lg text-xs font-medium text-stone-gray hover:border-deep-charcoal transition-colors disabled:opacity-50"
          >
            {syncMutation.isPending ? t('pos.syncing', 'Syncing...') : t('pos.syncNow', 'Sync Menu Now')}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-stone">
            {t('pos.connectDescription', 'Connect your Square POS to sync menu items and track revenue automatically.')}
          </p>
          <button
            type="button"
            onClick={handleConnect}
            disabled={connectMutation.isPending}
            className="px-4 py-2 bg-burgundy text-white rounded-lg text-sm font-medium hover:bg-burgundy-dark transition-colors disabled:opacity-50"
          >
            {connectMutation.isPending
              ? t('pos.connecting', 'Connecting...')
              : t('pos.connectSquare', 'Connect Square')}
          </button>
          {connection?.status === 'expired' && (
            <p className="text-xs text-amber-600">
              {t('pos.expired', 'Your Square connection expired. Please reconnect.')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
