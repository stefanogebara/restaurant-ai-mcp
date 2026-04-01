/**
 * IntegrationsPage
 *
 * POS Integration settings: API Keys + Webhook subscriptions.
 * Route: /host-dashboard/integrations
 */

import { useTranslation } from 'react-i18next';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import DashboardLayout from '../components/layout/DashboardLayout';
import APIKeysPanel from '../components/dashboard/APIKeysPanel';
import WebhooksPanel from '../components/dashboard/WebhooksPanel';

export default function IntegrationsPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('pageTitles.integrations', 'Integrations | seatable'));

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-10">
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-semibold text-[#1C1917]">
            {t('integrations.title', 'POS Integration')}
          </h1>
          <p className="text-sm text-[#706A65] mt-1">
            {t('integrations.subtitle', 'Connect your Point-of-Sale system to sync reservations, services, and table status in real-time.')}
          </p>
        </div>

        {/* API endpoint docs hint */}
        <div className="bg-[#FAFAF9] border border-[#E5E7EB] rounded-xl p-4 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-[#111827]">
            {t('integrations.endpointsTitle', 'Available Endpoints')}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-[#706A65]">
            <div className="border border-[#E5E7EB] rounded-lg p-3 bg-white">
              <p className="font-mono text-[#1C1917] font-medium">POST /api/pos/service-completion</p>
              <p className="mt-1">{t('integrations.endpointServiceCompletion', 'Report completed services with billing')}</p>
            </div>
            <div className="border border-[#E5E7EB] rounded-lg p-3 bg-white">
              <p className="font-mono text-[#1C1917] font-medium">GET /api/pos/reservations</p>
              <p className="mt-1">{t('integrations.endpointReservations', 'Pull reservations by date range')}</p>
            </div>
            <div className="border border-[#E5E7EB] rounded-lg p-3 bg-white">
              <p className="font-mono text-[#1C1917] font-medium">POST /api/pos/table-status</p>
              <p className="mt-1">{t('integrations.endpointTableStatus', 'Update table availability status')}</p>
            </div>
          </div>
        </div>

        {/* API Keys section */}
        <APIKeysPanel />

        {/* Divider */}
        <div className="border-t border-[#E5E7EB]" />

        {/* Webhooks section */}
        <WebhooksPanel />
      </div>
    </DashboardLayout>
  );
}
