/**
 * IntegrationsPage
 *
 * Developer-facing page: API Keys + Webhook subscriptions for custom POS
 * integrations. Previously presented as primary settings to every restaurant
 * owner — most users have no idea what an "API Key" or "Webhook" is and
 * see it as noise. We now lead with a clear "Developers" framing so João
 * knows whether this page is relevant to him.
 *
 * Route: /host-dashboard/integrations
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import DashboardLayout from '../components/layout/DashboardLayout';
import APIKeysPanel from '../components/dashboard/APIKeysPanel';
import WebhooksPanel from '../components/dashboard/WebhooksPanel';

export default function IntegrationsPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('pageTitles.integrations', 'Integrations | seatable'));

  // Endpoint reference is collapsed by default — it's the most jargon-heavy
  // section and only a tiny minority of users need to see route paths.
  const [showEndpoints, setShowEndpoints] = useState(false);

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        {/* Page header */}
        <div>
          <div className="inline-flex items-center gap-2 mb-3 px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-full">
            <span className="text-[10px] uppercase tracking-widest font-semibold text-amber-700">
              {t('integrations.devBadge', 'For developers')}
            </span>
          </div>
          <h1 className="text-2xl font-semibold text-[#1C1917]">
            {t('integrations.title', 'Custom POS integration')}
          </h1>
          <p className="text-sm text-[#706A65] mt-1">
            {t('integrations.subtitle', 'For technical staff or developers connecting your own POS system. Most restaurants do not need anything on this page — Seatable already handles reservations, services, and table status out of the box.')}
          </p>
        </div>

        {/* Friendly off-ramp for non-developers */}
        <div className="bg-rose-50 border border-rose-100 rounded-xl p-4">
          <p className="text-sm text-deep-charcoal">
            {t('integrations.nonDevHelp', 'Not sure if you need this?')}{' '}
            <a
              href="mailto:hello@seatable.one?subject=POS%20integration%20question"
              className="font-semibold text-burgundy hover:text-burgundy-dark underline underline-offset-2"
            >
              hello@seatable.one
            </a>{' '}
            {t('integrations.nonDevHelpSuffix', '— we can tell you in 2 minutes whether anything here is relevant to your restaurant.')}
          </p>
        </div>

        {/* API Keys section */}
        <APIKeysPanel />

        {/* Divider */}
        <div className="border-t border-[#E5E7EB]" />

        {/* Webhooks section */}
        <WebhooksPanel />

        {/* Endpoint docs — collapsed by default */}
        <div className="border-t border-[#E5E7EB] pt-6">
          <button
            type="button"
            onClick={() => setShowEndpoints((v) => !v)}
            className="text-xs text-muted-stone hover:text-deep-charcoal underline underline-offset-2"
          >
            {showEndpoints
              ? t('integrations.hideEndpoints', 'Hide REST API reference')
              : t('integrations.showEndpoints', 'Show REST API reference')}
          </button>
          {showEndpoints && (
            <div className="mt-4 glass-card p-4 space-y-2 rounded-xl">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-[#111827]">
                {t('integrations.endpointsTitle', 'Available Endpoints')}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-[#706A65]">
                <div className="border border-glass-border-dark rounded-lg p-3 bg-white/60">
                  <p className="font-mono text-[#1C1917] font-medium">POST /api/pos/service-completion</p>
                  <p className="mt-1">{t('integrations.endpointServiceCompletion', 'Report completed services with billing')}</p>
                </div>
                <div className="border border-glass-border-dark rounded-lg p-3 bg-white/60">
                  <p className="font-mono text-[#1C1917] font-medium">GET /api/pos/reservations</p>
                  <p className="mt-1">{t('integrations.endpointReservations', 'Pull reservations by date range')}</p>
                </div>
                <div className="border border-glass-border-dark rounded-lg p-3 bg-white/60">
                  <p className="font-mono text-[#1C1917] font-medium">POST /api/pos/table-status</p>
                  <p className="mt-1">{t('integrations.endpointTableStatus', 'Update table availability status')}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
