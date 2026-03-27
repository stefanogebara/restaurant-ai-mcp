import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { useToast } from '../contexts/ToastContext';

interface Reservation {
  reservation_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  date?: string;
  time?: string;
  reservation_time?: string; // API returns combined date-time
  party_size: number;
  special_requests?: string;
  status: string;
}

// Helper to parse reservation_time into date and time
function parseReservationDateTime(reservation: Reservation) {
  if (reservation.reservation_time) {
    const [datePart, timePart] = reservation.reservation_time.split(' ');
    return { date: datePart, time: timePart?.slice(0, 5) || '' };
  }
  return { date: reservation.date || '', time: reservation.time || '' };
}

export default function CustomerPortal() {
  const { t, i18n } = useTranslation();
  const restaurantName = null;
  const [lookupMethod, setLookupMethod] = useState<'id' | 'phone'>('id');
  const [reservationId, setReservationId] = useState('');
  const [phone, setPhone] = useState('');
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [isModifying, setIsModifying] = useState(false);
  const [modifiedData, setModifiedData] = useState<Partial<Reservation>>({});
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const lastLookupRef = useRef<{ method: string; value: string } | null>(null);
  const { success, error: showError } = useToast();

  const lookupMutation = useMutation<Reservation, Error, { method: string; value: string } | undefined>({
    mutationFn: async (override) => {
      const currentMethod = override?.method ?? lookupMethod;
      const currentValue = override?.value ?? (lookupMethod === 'id' ? reservationId : phone);

      if (currentMethod === 'id' && !currentValue.trim()) throw new Error(t('reservations.enterReservationId'));
      if (currentMethod === 'phone' && !currentValue.trim()) throw new Error(t('reservations.enterPhoneNumber'));

      lastLookupRef.current = { method: currentMethod, value: currentValue };

      const params = new URLSearchParams({
        action: 'lookup',
        ...(currentMethod === 'id'
          ? { reservation_id: currentValue }
          : { customer_phone: currentValue }),
      });
      const response = await fetch(`/api/customer-reservation?${params}`);
      const data = await response.json();
      if (!data.success || !data.reservation) throw new Error(data.message || t('reservations.reservationNotFoundLookup'));
      return data.reservation;
    },
    onSuccess: (res) => {
      setReservation(res);
      const { date, time } = parseReservationDateTime(res);
      setModifiedData({ ...res, date, time });
      success(t('reservations.reservationFound'));
    },
    onError: (err) => showError(err.message),
  });

  const modifyMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/customer-reservation?action=modify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservation_id: reservation!.reservation_id,
          customer_phone: reservation!.customer_phone,
          date: modifiedData.date,
          time: modifiedData.time,
          party_size: modifiedData.party_size,
          special_requests: modifiedData.special_requests,
        }),
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.message || t('reservations.updateFailed'));
      return data;
    },
    onSuccess: () => {
      if (lastLookupRef.current) {
        lookupMutation.mutate(lastLookupRef.current);
      }
      setIsModifying(false);
      success(t('reservations.reservationUpdated'));
    },
    onError: (err) => showError(err instanceof Error ? err.message : t('reservations.updateFailed')),
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/customer-reservation?action=cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservation_id: reservation!.reservation_id,
          customer_phone: reservation!.customer_phone,
        }),
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.message || t('reservations.cancelFailed2'));
      return data;
    },
    onSuccess: () => {
      success(t('reservations.reservationCancelledSuccess'));
      setReservation(prev => prev ? { ...prev, status: 'Cancelled' } : null);
      setShowCancelConfirm(false);
    },
    onError: (err) => showError(err instanceof Error ? err.message : t('reservations.cancelFailed2')),
  });

  function handleCancel() {
    if (!showCancelConfirm) {
      setShowCancelConfirm(true);
      return;
    }
    setShowCancelConfirm(false);
    cancelMutation.mutate();
  }

  const hasChanges = !!(reservation && modifiedData && (
    modifiedData.date !== parseReservationDateTime(reservation).date ||
    modifiedData.time !== parseReservationDateTime(reservation).time ||
    modifiedData.party_size !== reservation.party_size ||
    (modifiedData.special_requests ?? '') !== (reservation.special_requests ?? '')
  ));

  return (
    <div className="min-h-screen bg-warm-white flex flex-col">
      {/* Top Bar */}
      <header className="flex justify-between items-center px-6 sm:px-10 py-4 border-b border-border-gray bg-white">
        <div className="min-w-0 flex-1">
          {restaurantName ? (
            <>
              <div className="font-serif text-lg font-semibold text-deep-charcoal truncate">{restaurantName}</div>
              <div className="text-[11px] text-muted-stone">{t('common.poweredBy')} seatable<span className="text-burgundy">.</span></div>
            </>
          ) : (
            <div className="font-serif text-lg font-semibold text-deep-charcoal">
              seatable<span className="text-burgundy">.</span>
            </div>
          )}
        </div>
        <span className="text-[13px] text-warm-stone">{t('reservations.needHelp')}</span>
      </header>

      <div className="flex-1 flex justify-center px-6 py-16">
        <div className="max-w-[520px] w-full">
          {/* Header */}
          <div className="text-center mb-10">
            <h1 className="font-serif text-[32px] font-medium text-deep-charcoal tracking-tight mb-2">
              {t('reservations.manageTitle')}
            </h1>
            <p className="text-[15px] text-warm-stone font-light">
              {t('reservations.lookupSubtitle')}
            </p>
          </div>

          {!reservation ? (
            <>
              {/* Lookup Card */}
              <div className="bg-white border border-border-gray rounded-2xl p-8 mb-6">
                <h3 className="text-[15px] font-semibold text-deep-charcoal mb-5">{t('reservations.findReservation')}</h3>

                {/* Phone Input */}
                <div className="mb-4">
                  <label className="block text-[13px] font-medium text-stone-gray mb-1.5">{t('reservations.phoneNumber')}</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value); setLookupMethod('phone'); }}
                    placeholder="+XX XXXXXXXXX"
                    className="w-full px-4 py-3 border border-border-gray rounded-[10px] text-sm bg-white text-deep-charcoal placeholder:text-stone-300 focus:outline-none focus:border-burgundy focus:ring-[3px] focus:ring-burgundy/[6%]"
                    onKeyDown={(e) => e.key === 'Enter' && lookupMutation.mutate(undefined)}
                  />
                </div>

                {/* Divider */}
                <div className="flex items-center gap-4 my-4">
                  <div className="flex-1 h-px bg-border-gray" />
                  <span className="text-xs font-medium text-muted-stone">{t('common.or')}</span>
                  <div className="flex-1 h-px bg-border-gray" />
                </div>

                {/* Confirmation ID Input */}
                <div className="mb-2">
                  <label className="block text-[13px] font-medium text-stone-gray mb-1.5">{t('reservations.confirmationId')}</label>
                  <input
                    type="text"
                    value={reservationId}
                    onChange={(e) => { setReservationId(e.target.value); setLookupMethod('id'); }}
                    placeholder={t('reservations.confirmationIdPlaceholder', 'e.g. CEL-0218-A7K3')}
                    className="w-full px-4 py-3 border border-border-gray rounded-[10px] text-sm bg-white text-deep-charcoal placeholder:text-stone-300 focus:outline-none focus:border-burgundy focus:ring-[3px] focus:ring-burgundy/[6%]"
                    onKeyDown={(e) => e.key === 'Enter' && lookupMutation.mutate(undefined)}
                  />
                </div>

                <button
                  onClick={() => lookupMutation.mutate(undefined)}
                  disabled={lookupMutation.isPending}
                  className="w-full mt-4 py-3.5 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-semibold rounded-full transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {lookupMutation.isPending ? (
                    <>
                      <div aria-hidden="true" className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      {t('reservations.lookingUp')}
                    </>
                  ) : (
                    t('reservations.lookUpReservation')
                  )}
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              {/* Result Card */}
              <div className="bg-white border border-border-gray rounded-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-soft-gray">
                  <span className="text-[15px] font-semibold">{t('reservations.yourReservation')}</span>
                  <span className={`text-[11px] font-semibold px-3 py-1 rounded-full ${
                    reservation.status === 'Confirmed'
                      ? 'bg-rose-600/[8%] text-rose-600'
                      : reservation.status === 'Cancelled'
                      ? 'bg-red-600/[8%] text-red-600'
                      : 'bg-amber-600/[8%] text-amber-600'
                  }`}>
                    {reservation.status === 'Confirmed' ? t('reservations.statusConfirmed')
                      : reservation.status === 'Cancelled' ? t('reservations.statusCancelled')
                      : t('reservations.statusPending')}
                  </span>
                </div>

                {/* Body */}
                <div className="px-6 py-5">
                  {reservation.status === 'Cancelled' && (
                    <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 text-red-700 text-sm font-medium">
                      {t('reservations.reservationCancelled', 'This reservation has been cancelled')}
                    </div>
                  )}
                  {!isModifying ? (
                    <>
                      {(() => {
                        const { date, time } = parseReservationDateTime(reservation);
                        return (
                          <div className="space-y-0">
                            <div className="flex justify-between py-2.5 border-b border-soft-gray">
                              <span className="text-[13px] text-warm-stone">{t('reservations.date')}</span>
                              <span className="text-sm font-medium text-deep-charcoal">
                                {date ? new Date(date + 'T00:00:00').toLocaleDateString(i18n.language === 'pt-BR' ? 'pt-BR' : i18n.language === 'es' ? 'es-ES' : 'en-US', {
                                  weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
                                }) : t('common.notSet')}
                              </span>
                            </div>
                            <div className="flex justify-between py-2.5 border-b border-soft-gray">
                              <span className="text-[13px] text-warm-stone">{t('reservations.time')}</span>
                              <span className="text-sm font-medium text-deep-charcoal">{time || t('common.notSet')}</span>
                            </div>
                            <div className="flex justify-between py-2.5 border-b border-soft-gray">
                              <span className="text-[13px] text-warm-stone">{t('reservations.partySize')}</span>
                              <span className="text-sm font-medium text-deep-charcoal">{t('reservations.guestCount', { count: reservation.party_size })}</span>
                            </div>
                            <div className="flex justify-between py-2.5 border-b border-soft-gray">
                              <span className="text-[13px] text-warm-stone">{t('reservations.guest')}</span>
                              <span className="text-sm font-medium text-deep-charcoal">{reservation.customer_name}</span>
                            </div>
                            <div className="flex justify-between py-2.5">
                              <span className="text-[13px] text-warm-stone">{t('reservations.confirmation')}</span>
                              <span className="text-[13px] font-mono font-medium text-burgundy">{reservation.reservation_id}</span>
                            </div>
                          </div>
                        );
                      })()}

                      {reservation.special_requests && (
                        <div className="mt-4 pt-4 border-t border-border-gray">
                          <div className="text-xs text-warm-stone mb-1.5">{t('reservations.specialRequests')}</div>
                          <div className="text-sm text-deep-charcoal bg-soft-gray p-3 rounded-xl">{reservation.special_requests}</div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-[13px] font-medium text-stone-gray mb-1.5">{t('reservations.date')}</label>
                        <input type="date" value={modifiedData.date} onChange={(e) => setModifiedData({ ...modifiedData, date: e.target.value })} className="w-full px-4 py-3 border border-border-gray rounded-[10px] text-sm bg-white text-deep-charcoal focus:outline-none focus:border-burgundy focus:ring-[3px] focus:ring-burgundy/[6%]" />
                      </div>
                      <div>
                        <label className="block text-[13px] font-medium text-stone-gray mb-1.5">{t('reservations.time')}</label>
                        <input type="time" value={modifiedData.time} onChange={(e) => setModifiedData({ ...modifiedData, time: e.target.value })} className="w-full px-4 py-3 border border-border-gray rounded-[10px] text-sm bg-white text-deep-charcoal focus:outline-none focus:border-burgundy focus:ring-[3px] focus:ring-burgundy/[6%]" />
                      </div>
                      <div>
                        <label className="block text-[13px] font-medium text-stone-gray mb-1.5">{t('reservations.partySize')}</label>
                        <input type="number" min="1" max="20" value={modifiedData.party_size} onChange={(e) => setModifiedData({ ...modifiedData, party_size: parseInt(e.target.value) })} className="w-full px-4 py-3 border border-border-gray rounded-[10px] text-sm bg-white text-deep-charcoal focus:outline-none focus:border-burgundy focus:ring-[3px] focus:ring-burgundy/[6%]" />
                      </div>
                      <div>
                        <label className="block text-[13px] font-medium text-stone-gray mb-1.5">{t('reservations.specialRequests')}</label>
                        <textarea value={modifiedData.special_requests || ''} onChange={(e) => setModifiedData({ ...modifiedData, special_requests: e.target.value })} rows={3} placeholder={t('booking.specialRequestsPlaceholder')} className="w-full px-4 py-3 border border-border-gray rounded-[10px] text-sm bg-white text-deep-charcoal placeholder:text-stone-300 focus:outline-none focus:border-burgundy focus:ring-[3px] focus:ring-burgundy/[6%] resize-none" />
                      </div>
                      <div className="flex gap-2.5 pt-2">
                        <button type="button" onClick={() => { setIsModifying(false); setModifiedData(reservation); }} className="flex-1 py-3 border border-border-gray bg-white text-stone-gray font-medium rounded-[10px] text-[13px] hover:border-muted-stone transition-colors">{t('common.cancel')}</button>
                        <button type="button" onClick={() => modifyMutation.mutate()} disabled={!hasChanges || modifyMutation.isPending} className="flex-1 py-3 bg-burgundy text-white font-semibold rounded-[10px] text-[13px] hover:bg-burgundy-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                          {modifyMutation.isPending ? (<><div aria-hidden="true" className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{t('reservations.saving')}</>) : t('reservations.saveChanges')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                {!isModifying && reservation.status !== 'Cancelled' && (
                  <div className="flex gap-2.5 px-6 py-5 border-t border-soft-gray">
                    <button type="button" onClick={() => setIsModifying(true)} className="flex-1 py-3 border border-border-gray bg-white text-stone-gray font-medium rounded-[10px] text-[13px] hover:border-muted-stone transition-colors">
                      {t('reservations.editReservation')}
                    </button>
                    {showCancelConfirm ? (
                      <div className="flex gap-2 flex-1">
                        <button type="button" onClick={handleCancel} disabled={cancelMutation.isPending} className="flex-1 py-3 border border-red-600/20 bg-red-600 text-white font-medium rounded-[10px] text-[13px] hover:bg-red-700 transition-colors disabled:opacity-50">
                          {cancelMutation.isPending ? t('common.cancelling', 'Cancelling...') : t('reservations.yesCancelReservation')}
                        </button>
                        <button type="button" onClick={() => setShowCancelConfirm(false)} className="flex-1 py-3 border border-border-gray bg-white text-stone-gray font-medium rounded-[10px] text-[13px] hover:border-muted-stone transition-colors">
                          {t('reservations.keepReservation')}
                        </button>
                      </div>
                    ) : (
                      <button type="button" onClick={handleCancel} disabled={cancelMutation.isPending} className="flex-1 py-3 border border-red-600/20 bg-red-600/[4%] text-red-600 font-medium rounded-[10px] text-[13px] hover:bg-red-600/[8%] transition-colors disabled:opacity-50">
                        {cancelMutation.isPending ? t('common.cancelling', 'Cancelling...') : t('reservations.cancelReservation')}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Back Button */}
              <button
                onClick={() => { setReservation(null); setReservationId(''); setPhone(''); setIsModifying(false); }}
                className="w-full text-sm text-warm-stone hover:text-stone-gray transition-colors py-2"
              >
                &larr; {t('reservations.lookUpAnother')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
