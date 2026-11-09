import { useTranslation } from 'react-i18next';
import type { UpcomingReservation } from '../../types/host.types';
import { chipClassesForStatus, type SemanticStatusToken } from '../common/StatusLegend';

type Receipt = NonNullable<UpcomingReservation['whatsapp_confirmation']>;

const STATUS_TOKENS: Record<Receipt['status'], SemanticStatusToken> = {
  requested: 'warn',
  accepted: 'warn',
  sent: 'neutral',
  delivered: 'good',
  read: 'good',
  failed: 'danger',
  unknown: 'warn',
};

export default function WhatsAppConfirmationStatus({ receipt }: { receipt?: Receipt | null }) {
  const { t } = useTranslation();
  if (!receipt) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${chipClassesForStatus(STATUS_TOKENS[receipt.status])}`}
      title={t(`dashboard.whatsappConfirmation.${receipt.status}.description`)}
    >
      <span aria-hidden="true" className="w-1.5 h-1.5 shrink-0 rounded-full bg-current opacity-60" />
      WhatsApp · {t(`dashboard.whatsappConfirmation.${receipt.status}.label`)}
    </span>
  );
}
