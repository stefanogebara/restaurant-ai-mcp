/**
 * BookingChannelsPanel
 *
 * Shows all booking channel options with copy-to-clipboard:
 * 1. Direct URL
 * 2. Widget embed code
 * 3. QR Code (preview + download)
 * 4. Instagram bio link
 * 5. Google Maps instructions
 */

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import QRCodePanel from './QRCodePanel';

interface Props {
  slug: string;
}

type CopiedKey = 'url' | 'widget' | 'instagram' | null;

const BASE_URL = 'https://seatable.one';

function ChannelCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-[#E5E7EB] rounded-xl p-5 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-deep-charcoal">{title}</h3>
        <p className="text-xs text-warm-stone mt-0.5">{description}</p>
      </div>
      {children}
    </div>
  );
}

function CopyButton({
  text,
  copiedKey,
  myKey,
  onCopy,
  label,
}: {
  text: string;
  copiedKey: CopiedKey;
  myKey: CopiedKey;
  onCopy: (key: CopiedKey, text: string) => void;
  label: string;
}) {
  const { t } = useTranslation();
  const isCopied = copiedKey === myKey;

  return (
    <button
      type="button"
      onClick={() => onCopy(myKey, text)}
      aria-label={label}
      className="px-3 py-1.5 bg-deep-charcoal text-white text-xs font-medium rounded-lg hover:bg-charcoal-dark transition-colors flex items-center gap-1.5"
    >
      <ThiingsIcon name={isCopied ? 'check' : 'clipboard'} size="xs" />
      {isCopied ? t('common.copied', 'Copied!') : t('common.copy', 'Copy')}
    </button>
  );
}

export default function BookingChannelsPanel({ slug }: Props) {
  const { t } = useTranslation();
  const [copiedKey, setCopiedKey] = useState<CopiedKey>(null);

  const bookingUrl = `${BASE_URL}/book/${slug}`;
  const widgetSnippet = `<script src="${BASE_URL}/widget.js" data-slug="${slug}"></script>`;

  const handleCopy = useCallback((key: CopiedKey, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    });
  }, []);

  return (
    <div className="py-5 border-t border-[#E5E7EB] mt-8 space-y-5">
      <div>
        <h2 className="text-[13px] font-semibold uppercase tracking-widest text-[#111827]">
          {t('bookingChannels.title', 'Booking Channels')}
        </h2>
        <p className="text-xs text-warm-stone mt-1">
          {t('bookingChannels.subtitle', 'Share your booking page across all channels to maximize reservations.')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 1. Direct URL */}
        <ChannelCard
          title={t('bookingChannels.directUrl', 'Direct URL')}
          description={t('bookingChannels.directUrlDesc', 'Share this link on social media, emails, or your website.')}
        >
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-soft-gray rounded-lg px-3 py-2 text-xs text-deep-charcoal truncate">
              {bookingUrl}
            </code>
            <CopyButton
              text={bookingUrl}
              copiedKey={copiedKey}
              myKey="url"
              onCopy={handleCopy}
              label={t('bookingChannels.copyUrl', 'Copy booking URL')}
            />
          </div>
        </ChannelCard>

        {/* 2. Widget Embed */}
        <ChannelCard
          title={t('bookingChannels.widgetEmbed', 'Website Widget')}
          description={t('bookingChannels.widgetEmbedDesc', 'Add a floating booking button to any website.')}
        >
          <div className="flex items-start gap-2">
            <pre className="flex-1 bg-soft-gray rounded-lg px-3 py-2 text-xs text-deep-charcoal overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
              {widgetSnippet}
            </pre>
            <CopyButton
              text={widgetSnippet}
              copiedKey={copiedKey}
              myKey="widget"
              onCopy={handleCopy}
              label={t('bookingChannels.copyWidget', 'Copy widget code')}
            />
          </div>
        </ChannelCard>

        {/* 3. QR Code */}
        <ChannelCard
          title={t('bookingChannels.qrCode', 'QR Code')}
          description={t('bookingChannels.qrCodeDesc', 'Print for table tents, menus, or window displays.')}
        >
          <QRCodePanel slug={slug} />
        </ChannelCard>

        {/* 4. Instagram Bio */}
        <ChannelCard
          title={t('bookingChannels.instagramBio', 'Instagram Bio Link')}
          description={t('bookingChannels.instagramBioDesc', 'Add to your Instagram bio for easy booking access.')}
        >
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-soft-gray rounded-lg px-3 py-2 text-xs text-deep-charcoal truncate">
              {bookingUrl}
            </code>
            <CopyButton
              text={bookingUrl}
              copiedKey={copiedKey}
              myKey="instagram"
              onCopy={handleCopy}
              label={t('bookingChannels.copyInstagram', 'Copy link for Instagram bio')}
            />
          </div>
          <p className="text-xs text-warm-stone">
            {t('bookingChannels.instagramTip', 'Paste this URL in your Instagram profile > Edit Profile > Website field.')}
          </p>
        </ChannelCard>

        {/* 5. Google Maps */}
        <ChannelCard
          title={t('bookingChannels.googleMaps', 'Google Maps')}
          description={t('bookingChannels.googleMapsDesc', 'Add a booking link to your Google Business Profile.')}
        >
          <ol className="text-xs text-deep-charcoal space-y-1.5 list-decimal list-inside">
            <li>{t('bookingChannels.googleStep1', 'Go to business.google.com and sign in')}</li>
            <li>{t('bookingChannels.googleStep2', 'Select your restaurant listing')}</li>
            <li>{t('bookingChannels.googleStep3', 'Click "Edit profile" > "Contact"')}</li>
            <li>{t('bookingChannels.googleStep4', 'Add your booking URL to "Appointment links"')}</li>
          </ol>
          <div className="flex items-center gap-2 mt-2">
            <code className="flex-1 bg-soft-gray rounded-lg px-3 py-2 text-xs text-deep-charcoal truncate">
              {bookingUrl}
            </code>
            <CopyButton
              text={bookingUrl}
              copiedKey={copiedKey}
              myKey="url"
              onCopy={handleCopy}
              label={t('bookingChannels.copyGoogleUrl', 'Copy URL for Google Maps')}
            />
          </div>
        </ChannelCard>
      </div>
    </div>
  );
}
