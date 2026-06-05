/**
 * QRCodePanel
 *
 * Shows QR code preview, download button, and "Print for table tents" button.
 */

import { useTranslation } from 'react-i18next';
import { useBookingQR } from '../../hooks/useBookingQR';
import ThiingsIcon from '../common/ThiingsIcon';
import { useToast } from '../../contexts/ToastContext';

interface Props {
  slug: string;
}

export default function QRCodePanel({ slug }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const { qrBlobUrl, isLoading, error, downloadQR, printQR } = useBookingQR(slug);

  const handleDownload = () => {
    downloadQR();
    toast.success(t('bookingChannels.downloadStarted', 'QR Code downloaded'));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center bg-soft-gray rounded-xl p-6">
        {isLoading && (
          <div className="w-[200px] h-[200px] flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-glass-border-dark border-t-burgundy" />
          </div>
        )}
        {error && (
          <div className="w-[200px] h-[200px] flex items-center justify-center text-warm-stone text-sm">
            {t('bookingChannels.qrError', 'Failed to load QR code')}
          </div>
        )}
        {qrBlobUrl && (
          <img
            src={qrBlobUrl}
            alt={t('bookingChannels.qrAlt', 'Booking QR Code')}
            className="w-[200px] h-[200px] rounded-lg"
          />
        )}
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleDownload}
          disabled={!qrBlobUrl}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-deep-charcoal text-white text-sm font-medium rounded-xl hover:bg-charcoal-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ThiingsIcon name="download" size="xs" />
          {t('bookingChannels.downloadPNG', 'Download PNG')}
        </button>
        <button
          type="button"
          onClick={printQR}
          disabled={!qrBlobUrl}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-glass-border-dark text-deep-charcoal text-sm font-medium rounded-xl hover:bg-soft-gray transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ThiingsIcon name="external-link" size="xs" />
          {t('bookingChannels.printTableTent', 'Print for Table Tents')}
        </button>
      </div>
    </div>
  );
}
