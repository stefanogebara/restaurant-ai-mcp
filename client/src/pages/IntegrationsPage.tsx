/**
 * Owner-facing home for booking channels and external connections.
 * Developer API keys/webhooks are available, but no longer define the page.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { hostAPI } from '../services/api';
import DashboardLayout from '../components/layout/DashboardLayout';
import SettingsTabs, { type SettingsTabDef } from '../components/common/SettingsTabs';
import BookingChannelsPanel from '../components/dashboard/BookingChannelsPanel';
import InstagramPanel from '../components/dashboard/InstagramPanel';
import POSIntegrationPanel from '../components/dashboard/POSIntegrationPanel';
import StripeConnectPanel from '../components/dashboard/StripeConnectPanel';
import APIKeysPanel from '../components/dashboard/APIKeysPanel';
import WebhooksPanel from '../components/dashboard/WebhooksPanel';

function BookingChannelsTab() {
  const { t } = useTranslation();
  const { data: dashData, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: hostAPI.getDashboard,
    staleTime: 5 * 60 * 1000,
  });
  const slug: string = (dashData as { data?: { slug?: string } } | undefined)?.data?.slug || '';
  if (isLoading) return <p role="status" className="text-[15px] text-muted-stone">{t('integrations.loadingBookingLink')}</p>;
  if (!slug) return <p className="text-[15px] text-muted-stone">{t('voiceSettings.widgetUnavailable')}</p>;
  return <BookingChannelsPanel slug={slug} />;
}

export default function IntegrationsPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('pageTitles.integrations', 'Integrations | seatable'));
  const [showEndpoints, setShowEndpoints] = useState(false);
  const developerTab = (
    <div className="space-y-10">
      <div>
        <p className="text-[15px] text-muted-stone max-w-2xl">{t('integrations.devIntro')}</p>
        <p className="text-[15px] text-muted-stone mt-3">
          {t('integrations.nonDevHelp')}{' '}
          <a
            href="mailto:hello@seatable.one?subject=POS%20integration%20question"
            className="text-burgundy hover:text-burgundy-dark underline underline-offset-2"
          >
            hello@seatable.one
          </a>
        </p>
      </div>
      <APIKeysPanel />
      <div className="hairline" />
      <WebhooksPanel />
      <div className="hairline pt-6">
        <button
          type="button"
          onClick={() => setShowEndpoints((value) => !value)}
          aria-expanded={showEndpoints}
          className="text-sm text-burgundy hover:text-burgundy-dark underline underline-offset-2"
        >
          {showEndpoints
            ? t('integrations.hideEndpoints', 'Hide REST API reference')
            : t('integrations.showEndpoints', 'Show REST API reference')}
        </button>
        {showEndpoints && (
          <div className="mt-5 liquid-capsule p-5">
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone mb-4">
              {t('integrations.endpointsTitle')}
            </h2>
            <div className="space-y-4 text-[15px]">
              {([
                ['POST /api/pos/service-completion', 'endpointServiceCompletion'],
                ['GET /api/pos/reservations', 'endpointReservations'],
                ['POST /api/pos/table-status', 'endpointTableStatus'],
              ] as const).map(([route, description]) => (
                <div key={route} className="border-t border-glass-border-dark pt-3 first:border-t-0 first:pt-0">
                  <code className="font-mono text-sm text-deep-charcoal">{route}</code>
                  <p className="text-muted-stone mt-1">{t(`integrations.${description}`)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const tabs: SettingsTabDef[] = [
    {
      id: 'booking',
      label: t('integrations.tab.booking'),
      content: <BookingChannelsTab />,
    },
    { id: 'instagram', label: t('integrations.tab.instagram'), content: <InstagramPanel /> },
    {
      id: 'pos',
      label: t('integrations.tab.pos'),
      content: <div className="space-y-10"><POSIntegrationPanel /><div className="hairline" /><StripeConnectPanel /></div>,
    },
    { id: 'developers', label: t('integrations.tab.developers'), content: developerTab },
  ];

  return (
    <DashboardLayout>
      <div className="max-w-5xl p-6 mt-14 lg:mt-0 lg:p-8">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone mb-2">
          {t('integrations.eyebrow')}
        </p>
        <h1 className="font-serif text-3xl sm:text-4xl text-deep-charcoal">
          {t('integrations.pageTitle')}
        </h1>
        <p className="text-[15px] text-muted-stone mt-2 mb-8 max-w-2xl">
          {t('integrations.pageIntro')}
        </p>
        <SettingsTabs tabs={tabs} hashKey="integrations" lazyMount />
        <div className="hairline my-10" />
        <p className="text-[15px] text-muted-stone">
          {t('integrations.whatsAppElsewhere')}{' '}
          <Link to="/host-dashboard/whatsapp" className="text-burgundy hover:text-burgundy-dark underline underline-offset-2">
            {t('integrations.openWhatsApp')}
          </Link>
        </p>
      </div>
    </DashboardLayout>
  );
}
