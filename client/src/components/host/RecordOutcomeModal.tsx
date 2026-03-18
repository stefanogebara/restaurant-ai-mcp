/**
 * Record Outcome Modal
 *
 * Records actual reservation outcomes for ML training and ROI calculation
 * Captures: showed_up, no_show, cancelled
 * Records: intervention taken, intervention type, cost
 */

import { useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import ThiingsIcon from '../common/ThiingsIcon';
import type { UpcomingReservation } from '../../types/host.types';
import RiskScoreBadge from './RiskScoreBadge';

interface RecordOutcomeModalProps {
  reservation: UpcomingReservation | null;
  onClose: () => void;
  onSubmit: (data: OutcomeData) => Promise<void>;
}

export interface OutcomeData {
  reservation_id: string;
  actual_outcome: 'showed_up' | 'no_show' | 'cancelled';
  intervention_taken: boolean;
  intervention_type: 'confirmation_call' | 'deposit_required' | 'premium_seating' | 'none';
  intervention_cost: number;
  notes: string;
}

export default function RecordOutcomeModal({
  reservation,
  onClose,
  onSubmit
}: RecordOutcomeModalProps) {
  const { error } = useToast();
  const [outcome, setOutcome] = useState<'showed_up' | 'no_show' | 'cancelled' | null>(null);
  const [interventionTaken, setInterventionTaken] = useState(false);
  const [interventionType, setInterventionType] = useState<'confirmation_call' | 'deposit_required' | 'premium_seating' | 'none'>('none');
  const [interventionCost, setInterventionCost] = useState(0);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!reservation) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!outcome) {
      error('Please select an outcome');
      return;
    }

    setIsSubmitting(true);

    try {
      await onSubmit({
        reservation_id: reservation.reservation_id,
        actual_outcome: outcome,
        intervention_taken: interventionTaken,
        intervention_type: interventionTaken ? interventionType : 'none',
        intervention_cost: interventionTaken ? interventionCost : 0,
        notes
      });

      onClose();
    } catch (err) {
      console.error('Error recording outcome:', err);
      error('Failed to record outcome. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div role="dialog" aria-modal="true" aria-label="Record Outcome" className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-border-gray">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-border-gray p-6 flex items-center justify-between rounded-t-2xl">
          <div>
            <h2 className="text-2xl font-bold text-deep-charcoal">Record Outcome</h2>
            <p className="text-sm text-stone-gray mt-1">Track actual outcome for ML learning</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-10 h-10 rounded-full hover:bg-soft-gray flex items-center justify-center transition-colors disabled:opacity-50"
            disabled={isSubmitting}
          >
            <ThiingsIcon name="close" pxSize={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Reservation Info */}
          <div className="bg-soft-gray rounded-xl p-4 space-y-2 border border-border-gray">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg text-deep-charcoal">{reservation.customer_name}</h3>
              <RiskScoreBadge
                riskScore={reservation.no_show_risk_score}
                riskLevel={reservation.no_show_risk_level}
                confidence={reservation.prediction_confidence}
                size="medium"
              />
            </div>
            <div className="text-sm text-stone-gray space-y-1">
              <div>Party of {reservation.party_size} • {reservation.time}</div>
              <div>{reservation.customer_phone}</div>
              {reservation.special_requests && (
                <div className="italic text-stone-gray">"{reservation.special_requests}"</div>
              )}
            </div>
          </div>

          {/* Outcome Selection */}
          <div>
            <label className="block text-sm font-semibold text-deep-charcoal mb-3">What happened?</label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setOutcome('showed_up')}
                className={`p-4 rounded-2xl border-2 transition-all ${
                  outcome === 'showed_up'
                    ? 'border-rose-600 bg-rose-600/10'
                    : 'border-border-gray hover:border-rose-600/50'
                }`}
              >
                <div className="flex justify-center mb-2"><ThiingsIcon name="check-circle" pxSize={32} /></div>
                <div className="text-sm font-medium text-deep-charcoal">Showed Up</div>
              </button>

              <button
                type="button"
                onClick={() => setOutcome('no_show')}
                className={`p-4 rounded-2xl border-2 transition-all ${
                  outcome === 'no_show'
                    ? 'border-burgundy bg-burgundy/10'
                    : 'border-border-gray hover:border-burgundy/50'
                }`}
              >
                <div className="flex justify-center mb-2"><ThiingsIcon name="x-circle" pxSize={32} /></div>
                <div className="text-sm font-medium text-deep-charcoal">No Show</div>
              </button>

              <button
                type="button"
                onClick={() => setOutcome('cancelled')}
                className={`p-4 rounded-2xl border-2 transition-all ${
                  outcome === 'cancelled'
                    ? 'border-amber-600 bg-amber-600/10'
                    : 'border-border-gray hover:border-amber-600/50'
                }`}
              >
                <div className="flex justify-center mb-2"><ThiingsIcon name="ban" pxSize={32} /></div>
                <div className="text-sm font-medium text-deep-charcoal">Cancelled</div>
              </button>
            </div>
          </div>

          {/* Intervention Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="intervention-taken"
                checked={interventionTaken}
                onChange={(e) => setInterventionTaken(e.target.checked)}
                className="w-4 h-4 rounded border-border-gray text-burgundy focus:ring-burgundy"
              />
              <label htmlFor="intervention-taken" className="text-sm font-semibold text-deep-charcoal">
                We took action to prevent no-show
              </label>
            </div>

            {interventionTaken && (
              <div className="space-y-4 pl-6">
                {/* Intervention Type */}
                <div>
                  <label className="block text-sm font-medium text-deep-charcoal mb-2">What action did we take?</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setInterventionType('confirmation_call')}
                      className={`p-3 rounded-2xl border-2 transition-all ${
                        interventionType === 'confirmation_call'
                          ? 'border-burgundy bg-burgundy/10'
                          : 'border-border-gray hover:border-burgundy/50'
                      }`}
                    >
                      <div className="flex justify-center mb-1"><ThiingsIcon name="phone" pxSize={20} /></div>
                      <div className="text-xs font-medium text-deep-charcoal">Call</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setInterventionType('deposit_required')}
                      className={`p-3 rounded-2xl border-2 transition-all ${
                        interventionType === 'deposit_required'
                          ? 'border-violet-600 bg-violet-600/10'
                          : 'border-border-gray hover:border-violet-600/50'
                      }`}
                    >
                      <div className="flex justify-center mb-1"><ThiingsIcon name="credit-card" pxSize={20} /></div>
                      <div className="text-xs font-medium text-deep-charcoal">Deposit</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setInterventionType('premium_seating')}
                      className={`p-3 rounded-2xl border-2 transition-all ${
                        interventionType === 'premium_seating'
                          ? 'border-amber-600 bg-amber-600/10'
                          : 'border-border-gray hover:border-amber-600/50'
                      }`}
                    >
                      <div className="flex justify-center mb-1"><ThiingsIcon name="star" pxSize={20} /></div>
                      <div className="text-xs font-medium text-deep-charcoal">Premium</div>
                    </button>
                  </div>
                </div>

                {/* Intervention Cost */}
                <div>
                  <label htmlFor="cost" className="block text-sm font-medium text-deep-charcoal mb-2">
                    Cost of intervention (€)
                  </label>
                  <input
                    type="number"
                    id="cost"
                    min="0"
                    step="0.5"
                    value={interventionCost}
                    onChange={(e) => setInterventionCost(parseFloat(e.target.value) || 0)}
                    className="w-full px-4 py-2.5 bg-soft-gray border border-border-gray rounded-xl text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy focus:border-transparent"
                    placeholder="3.00"
                  />
                  <p className="text-xs text-muted-stone mt-1">
                    Staff time, phone costs, or other expenses
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-deep-charcoal mb-2">
              Notes (optional)
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 bg-soft-gray border border-border-gray rounded-xl text-deep-charcoal placeholder-muted-stone focus:outline-none focus:ring-2 focus:ring-burgundy focus:border-transparent"
              placeholder="Any additional context about this reservation..."
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 px-4 py-3 border border-border-gray text-stone-gray font-medium rounded-xl hover:bg-soft-gray transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!outcome || isSubmitting}
              className="flex-1 px-4 py-3 bg-burgundy hover:bg-burgundy-dark text-white rounded-xl font-semibold transition-colors disabled:bg-muted-stone disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Recording...' : 'Record Outcome'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
