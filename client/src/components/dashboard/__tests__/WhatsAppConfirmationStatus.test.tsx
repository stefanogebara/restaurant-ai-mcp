import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import WhatsAppConfirmationStatus from '../WhatsAppConfirmationStatus';
import ReservationsList from '../ReservationsList';
import type { UpcomingReservation } from '../../../types/host.types';
import en from '../../../i18n/locales/en.json';
import ptBR from '../../../i18n/locales/pt-BR.json';
import es from '../../../i18n/locales/es.json';

const i18n = createInstance();
const updatedAt = '2026-11-09T12:00:00Z';
const reservation: UpcomingReservation = {
  reservation_id: 'receipt-only', customer_name: 'Receipt Guest', customer_phone: '+5511999999999',
  party_size: 2, date: '2026-11-09', time: '19:00', reservation_time: '2026-11-09T19:00:00Z', checked_in: false,
};

type Receipt = NonNullable<UpcomingReservation['whatsapp_confirmation']>;
const states: Array<{ status: Receipt['status']; color: string; labels: [string, string, string] }> = [
  { status: 'requested', color: 'amber', labels: ['Sending unconfirmed', 'Envio não confirmado', 'Envío sin confirmar'] },
  { status: 'accepted', color: 'amber', labels: ['Accepted for sending', 'Aceito para envio', 'Aceptado para envío'] },
  { status: 'sent', color: 'stone', labels: ['Sent', 'Enviada', 'Enviado'] },
  { status: 'delivered', color: 'emerald', labels: ['Delivered', 'Entregue', 'Entregado'] },
  { status: 'read', color: 'emerald', labels: ['Read', 'Lida', 'Leído'] },
  { status: 'failed', color: 'red', labels: ['Sending failed', 'Falha no envio', 'Error de envío'] },
  { status: 'unknown', color: 'amber', labels: ['Sending unconfirmed', 'Envio não confirmado', 'Envío sin confirmar'] },
];

function renderStatus(receipt?: Receipt | null) {
  return render(<I18nextProvider i18n={i18n}><WhatsAppConfirmationStatus receipt={receipt} /></I18nextProvider>);
}

function renderList(receipt?: Receipt | null, extra: Partial<UpcomingReservation> = {}) {
  return render(
    <I18nextProvider i18n={i18n}>
      <ReservationsList
        todayReservations={[{ ...reservation, ...extra, whatsapp_confirmation: receipt }]}
        tomorrowReservations={[]} onCheckIn={vi.fn()} onIntervention={vi.fn()}
      />
    </I18nextProvider>,
  );
}

beforeAll(async () => {
  await i18n.init({
    lng: 'en', fallbackLng: 'en',
    resources: { en: { translation: en }, 'pt-BR': { translation: ptBR }, es: { translation: es } },
    interpolation: { escapeValue: false },
  });
});
beforeEach(async () => { await i18n.changeLanguage('en'); });

describe('WhatsAppConfirmationStatus', () => {
  it.each([undefined, null])('renders nothing without a receipt (%s)', (receipt) => {
    expect(renderStatus(receipt).container).toBeEmptyDOMElement();
  });

  describe.each(['en', 'pt-BR', 'es'])('%s copy', (language) => {
    it.each(states)('renders the $status receipt with accurate text and semantic color', async ({ status, color, labels }) => {
      await i18n.changeLanguage(language);
      renderStatus({ status, status_updated_at: updatedAt });
      const label = labels[['en', 'pt-BR', 'es'].indexOf(language)];
      const badge = screen.getByText(`WhatsApp · ${label}`);
      expect(badge).toHaveClass(`text-${color}-700`);
      expect(badge).toHaveAttribute('title');
      expect(badge.getAttribute('title')).not.toBe(`dashboard.whatsappConfirmation.${status}.description`);
    });
  });

  it.each(['requested', 'unknown'] as const)('explains that %s has no sending or delivery confirmation', (status) => {
    renderStatus({ status, status_updated_at: updatedAt });
    expect(screen.getByText('WhatsApp · Sending unconfirmed')).toHaveAttribute(
      'title', 'Sending was requested, but sending and delivery are unconfirmed.',
    );
  });

  it('explains acceptance without claiming sending or delivery', () => {
    renderStatus({ status: 'accepted', status_updated_at: updatedAt });
    expect(screen.getByText('WhatsApp · Accepted for sending')).toHaveAttribute(
      'title', 'Accepted for sending. Sending and delivery are not yet confirmed.',
    );
  });

  it('explains that sent does not confirm delivery', () => {
    renderStatus({ status: 'sent', status_updated_at: updatedAt });
    expect(screen.getByText('WhatsApp · Sent')).toHaveAttribute(
      'title', 'Sent to WhatsApp. Delivery to the guest is not yet confirmed.',
    );
  });
});

describe('reservation receipt badges', () => {
  it('renders a receipt without risk or deposit data', () => {
    renderList({ status: 'delivered', status_updated_at: updatedAt });
    expect(screen.getByText('Receipt Guest')).toBeInTheDocument();
    expect(screen.getByText('WhatsApp · Delivered')).toBeVisible();
  });

  it.each([undefined, null])('does not invent a WhatsApp status when receipt is %s', (receipt) => {
    renderList(receipt);
    expect(screen.getByText('Receipt Guest')).toBeInTheDocument();
    expect(screen.queryByText(/WhatsApp/)).not.toBeInTheDocument();
  });

  it('keeps risk and deposit information visible on the same reservation', () => {
    renderList({ status: 'failed', status_updated_at: updatedAt }, { ml_risk_score: 60, deposit_amount: 50 });
    const badgeRow = screen.getByText('WhatsApp · Sending failed').parentElement!.parentElement!;
    expect(within(badgeRow).getByText('Likely to skip')).toBeInTheDocument();
    expect(within(badgeRow).getByText(/held/)).toBeInTheDocument();
  });
});
