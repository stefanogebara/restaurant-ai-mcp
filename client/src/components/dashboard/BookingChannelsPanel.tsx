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

        {/* 2. Widget Embed - reframed for non-technical owners. The raw
            <script> snippet is still here for developers who know what to
            do with it, but the primary action is now an "Email to my web
            person" link that mailto's a prefilled message + the snippet so
            João doesn't have to figure out how to send it. */}
        <ChannelCard
          title={t('bookingChannels.widgetEmbed', 'Add a booking button to your website')}
          description={t('bookingChannels.widgetEmbedDesc', "Drops a 'Book a table' button on any page. If you have a web developer, email it to them in one click.")}
        >
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <a
                href={`mailto:?subject=${encodeURIComponent('Please add this booking button to our website')}&body=${encodeURIComponent(
                  `Hi,\n\nPlease add this snippet anywhere on our website (just before </body> works) so customers can book a table directly from the site.\n\n${widgetSnippet}\n\nLet me know when it's live — I'd like to test it.\n\nThanks!`
                )}`}
                className="px-3 py-1.5 bg-burgundy hover:bg-burgundy-dark text-white text-xs font-semibold rounded-lg transition-colors"
              >
                {t('bookingChannels.emailToWebmaster', 'Email to my web person')}
              </a>
              <CopyButton
                text={widgetSnippet}
                copiedKey={copiedKey}
                myKey="widget"
                onCopy={handleCopy}
                label={t('bookingChannels.copyWidget', 'Copy code')}
              />
            </div>
            <details className="text-xs">
              <summary className="text-muted-stone hover:text-deep-charcoal cursor-pointer underline underline-offset-2">
                {t('bookingChannels.showSnippet', 'Show the code')}
              </summary>
              <pre className="mt-2 bg-soft-gray rounded-lg px-3 py-2 text-xs text-deep-charcoal overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
                {widgetSnippet}
              </pre>
            </details>
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
