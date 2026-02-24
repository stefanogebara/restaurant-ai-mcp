import { useState } from 'react';
import type { UpcomingReservation } from '../../types/host.types';
import ReservationNotesEditor from './ReservationNotesEditor';
import ThiingsIcon from '../common/ThiingsIcon';

interface ReservationDetailsModalProps {
  isOpen: boolean;
  reservation: UpcomingReservation | null;
  onClose: () => void;
  onUpdate?: (updates: Partial<UpcomingReservation>) => void;
}

export default function ReservationDetailsModal({ isOpen, reservation, onClose, onUpdate }: ReservationDetailsModalProps) {
  const [isEditingNotes, setIsEditingNotes] = useState(false);

  if (!isOpen || !reservation) return null;

  const handleSaveNotes = async (updates: Partial<UpcomingReservation>) => {
    if (onUpdate) {
      await onUpdate(updates);
    }
    setIsEditingNotes(false);
  };

  // Format time for display
  const formatTime = (timeStr: string) => {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  // Format date for display
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    };
    return date.toLocaleDateString('en-US', options);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto border border-border-gray"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-2xl font-bold text-deep-charcoal mb-1">Reservation Details</h2>
            <p className="text-muted-stone text-sm">ID: {reservation.reservation_id}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-soft-gray rounded-lg transition"
          >
            <ThiingsIcon name="close" pxSize={24} className="text-stone-gray" />
          </button>
        </div>

        {/* Status Badge */}
        {reservation.checked_in && (
          <div className="mb-4">
            <span className="px-3 py-1.5 bg-green-600/10 text-green-600 text-sm rounded-lg inline-flex items-center gap-2">
              <ThiingsIcon name="check-circle" pxSize={16} />
              Checked In
              {reservation.checked_in_at && (
                <span className="text-xs">· {new Date(reservation.checked_in_at).toLocaleTimeString()}</span>
              )}
            </span>
          </div>
        )}

        {/* Main Details Grid */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* Customer Name */}
          <div className="bg-soft-gray rounded-xl p-4 border border-border-gray">
            <div className="text-xs text-muted-stone mb-1">Customer Name</div>
            <div className="text-deep-charcoal font-semibold text-lg">{reservation.customer_name}</div>
          </div>

          {/* Party Size */}
          <div className="bg-soft-gray rounded-xl p-4 border border-border-gray">
            <div className="text-xs text-muted-stone mb-1">Party Size</div>
            <div className="text-deep-charcoal font-semibold text-lg flex items-center gap-2">
              <ThiingsIcon name="users" pxSize={20} className="text-burgundy" />
              {reservation.party_size} guests
            </div>
          </div>

          {/* Date */}
          <div className="bg-soft-gray rounded-xl p-4 border border-border-gray">
            <div className="text-xs text-muted-stone mb-1">Date</div>
            <div className="text-deep-charcoal font-semibold">{formatDate(reservation.date)}</div>
          </div>

          {/* Time */}
          <div className="bg-soft-gray rounded-xl p-4 border border-border-gray">
            <div className="text-xs text-muted-stone mb-1">Time</div>
            <div className="text-deep-charcoal font-semibold text-lg flex items-center gap-2">
              <ThiingsIcon name="clock" pxSize={20} className="text-burgundy" />
              {formatTime(reservation.time || '')}
            </div>
          </div>

          {/* Phone */}
          {reservation.customer_phone && (
            <div className="bg-soft-gray rounded-xl p-4 border border-border-gray">
              <div className="text-xs text-muted-stone mb-1">Phone Number</div>
              <div className="text-deep-charcoal font-semibold flex items-center gap-2">
                <ThiingsIcon name="phone" pxSize={20} className="text-green-600" />
                {reservation.customer_phone}
              </div>
            </div>
          )}

          {/* Status */}
          {reservation.status && (
            <div className="bg-soft-gray rounded-xl p-4 border border-border-gray">
              <div className="text-xs text-muted-stone mb-1">Status</div>
              <div className="text-deep-charcoal font-semibold capitalize">{reservation.status}</div>
            </div>
          )}
        </div>

        {/* Special Requests */}
        {reservation.special_requests && (
          <div className="mb-6">
            <div className="bg-soft-gray rounded-xl p-4 border border-border-gray">
              <div className="flex items-start gap-3">
                <ThiingsIcon name="chat" pxSize={20} className="text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="text-xs text-muted-stone mb-1">Special Requests</div>
                  <div className="text-deep-charcoal">{reservation.special_requests}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Enhanced Notes Section */}
        <div className="mb-6 bg-soft-gray rounded-xl p-5 border border-border-gray">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-deep-charcoal">Customer Notes</h3>
            <button
              onClick={() => setIsEditingNotes(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-burgundy hover:bg-burgundy-dark text-white text-sm rounded-xl transition"
            >
              <ThiingsIcon name="edit" pxSize={16} />
              Edit Notes
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Customer Type */}
            {reservation.customer_type && (
              <div className="flex items-start gap-3">
                <ThiingsIcon name="users" pxSize={20} className="mt-0.5" />
                <div>
                  <div className="text-xs text-muted-stone">Customer Type</div>
                  <div className="text-deep-charcoal font-medium">{reservation.customer_type}</div>
                  {reservation.first_time_visitor && (
                    <div className="flex items-center gap-1 text-xs text-amber-600 mt-1">
                      <ThiingsIcon name="star" pxSize={12} />
                      First Time Visitor
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Dietary Restrictions */}
            {reservation.dietary_restrictions && reservation.dietary_restrictions.length > 0 && (
              <div className="flex items-start gap-3">
                <ThiingsIcon name="utensils" pxSize={20} className="mt-0.5" />
                <div>
                  <div className="text-xs text-muted-stone">Dietary Restrictions</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {reservation.dietary_restrictions.map((restriction) => (
                      <span
                        key={restriction}
                        className="px-2 py-0.5 bg-green-600/10 text-green-600 text-xs rounded-full"
                      >
                        {restriction}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Language Preference */}
            {reservation.language_preference && (
              <div className="flex items-start gap-3">
                <ThiingsIcon name="languages" pxSize={20} className="mt-0.5" />
                <div>
                  <div className="text-xs text-muted-stone">Language</div>
                  <div className="text-deep-charcoal font-medium">{reservation.language_preference}</div>
                </div>
              </div>
            )}

            {/* Seating Preference */}
            {reservation.seating_preference && (
              <div className="flex items-start gap-3">
                <ThiingsIcon name="map-pin" pxSize={20} className="mt-0.5" />
                <div>
                  <div className="text-xs text-muted-stone">Seating Preference</div>
                  <div className="text-deep-charcoal font-medium">{reservation.seating_preference}</div>
                </div>
              </div>
            )}

            {/* Special Occasion */}
            {reservation.special_occasion && (
              <div className="flex items-start gap-3">
                <ThiingsIcon name="calendar" pxSize={20} className="mt-0.5" />
                <div>
                  <div className="text-xs text-muted-stone">Special Occasion</div>
                  <div className="text-deep-charcoal font-medium">{reservation.special_occasion}</div>
                </div>
              </div>
            )}

            {/* Accessibility Needs */}
            {reservation.accessibility_needs && reservation.accessibility_needs !== 'None' && (
              <div className="flex items-start gap-3">
                <ThiingsIcon name="accessibility" pxSize={20} className="mt-0.5" />
                <div>
                  <div className="text-xs text-muted-stone">Accessibility</div>
                  <div className="text-deep-charcoal font-medium">{reservation.accessibility_needs}</div>
                </div>
              </div>
            )}
          </div>

          {/* Internal Notes */}
          {reservation.internal_notes && (
            <div className="mt-4 pt-4 border-t border-border-gray">
              <div className="flex items-start gap-3">
                <ThiingsIcon name="file-text" pxSize={20} className="mt-0.5" />
                <div className="flex-1">
                  <div className="text-xs text-muted-stone mb-1">Internal Notes (Staff Only)</div>
                  <div className="text-stone-gray text-sm">{reservation.internal_notes}</div>
                </div>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!reservation.customer_type &&
           !reservation.dietary_restrictions?.length &&
           !reservation.language_preference &&
           !reservation.seating_preference &&
           !reservation.special_occasion &&
           !reservation.internal_notes && (
            <div className="text-center py-4">
              <div className="w-10 h-10 mx-auto mb-2 bg-soft-gray rounded-xl flex items-center justify-center">
                <ThiingsIcon name="file-text" pxSize={18} />
              </div>
              <p className="text-sm text-muted-stone">No additional notes yet.</p>
              <p className="text-xs text-muted-stone mt-1">Click "Edit Notes" to add customer information.</p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 border border-border-gray text-stone-gray rounded-xl hover:bg-soft-gray transition-colors font-medium"
          >
            Close
          </button>
        </div>
      </div>

      {/* Notes Editor Modal */}
      {isEditingNotes && (
        <ReservationNotesEditor
          reservation={reservation}
          onSave={handleSaveNotes}
          onCancel={() => setIsEditingNotes(false)}
        />
      )}
    </div>
  );
}
