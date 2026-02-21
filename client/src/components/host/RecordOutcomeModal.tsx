/**
 * Record Outcome Modal
 *
 * Records actual reservation outcomes for ML training and ROI calculation
 * Captures: showed_up, no_show, cancelled
 * Records: intervention taken, intervention type, cost
 */

import { useState } from 'react';
import ThiingsIcon from '../common/ThiingsIcon';
import type { UpcomingReservation } from '../../types/host.types';
import RiskScoreBadge from './RiskScoreBadge';
import { useToast } from '../../contexts/ToastContext';

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
  const [outcome, setOutcome] = useState<'showed_up' | 'no_show' | 'cancelled' | null>(null);
  const [interventionTaken, setInterventionTaken] = useState(false);
  const [interventionType, setInterventionType] = useState<'confirmation_call' | 'deposit_required' | 'premium_seating' | 'none'>('none');
  const [interventionCost, setInterventionCost] = useState(0);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const { error: showError } = useToast();

  if (!reservation) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!outcome) {
      setValidationError('Please select an outcome');
      return;
    }

    setValidationError(null);
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
    } catch (error) {
      console.error('Error recording outcome:', error);
      showError('Failed to record outcome. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div role="dialog" aria-modal="true" aria-label="Record Outcome" className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-[#E7E5E4]">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-[#E7E5E4] p-6 flex items-center justify-between rounded-t-2xl">
          <div>
            <h2 className="text-2xl font-bold text-[#1C1917]">Record Outcome</h2>
            <p className="text-sm text-[#57534E] mt-1">Track actual outcome for ML learning</p>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full hover:bg-[#F5F5F4] flex items-center justify-center transition-colors"
            disabled={isSubmitting}
          >
            <ThiingsIcon name="close" pxSize={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Reservation Info */}
          <div className="bg-[#F5F5F4] rounded-xl p-4 space-y-2 border border-[#E7E5E4]">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg text-[#1C1917]">{reservation.customer_name}</h3>
              <RiskScoreBadge
                riskScore={reservation.no_show_risk_score}
                riskLevel={reservation.no_show_risk_level}
                confidence={reservation.prediction_confidence}
                size="medium"
              />
            </div>
            <div className="text-sm text-[#57534E] space-y-1">
              <div>Party of {reservation.party_size} • {reservation.time}</div>
              <div>{reservation.customer_phone}</div>
              {reservation.special_requests && (
                <div className="italic text-[#57534E]">"{reservation.special_requests}"</div>
              )}
            </div>
          </div>

          {/* Outcome Selection */}
          <div>
            <label className="block text-sm font-semibold text-[#1C1917] mb-3">What happened?</label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setOutcome('showed_up')}
                className={`p-4 rounded-xl border-2 transition-all ${
                  outcome === 'showed_up'
                    ? 'border-[#16a34a] bg-[#16a34a]/10'
                    : 'border-[#E7E5E4] hover:border-[#16a34a]/50'
                }`}
              >
                <div className="flex justify-center mb-2"><ThiingsIcon name="check-circle" pxSize={32} /></div>
                <div className="text-sm font-medium text-[#1C1917]">Showed Up</div>
              </button>

              <button
                type="button"
                onClick={() => setOutcome('no_show')}
                className={`p-4 rounded-xl border-2 transition-all ${
                  outcome === 'no_show'
                    ? 'border-[#9F1239] bg-[#9F1239]/10'
                    : 'border-[#E7E5E4] hover:border-[#9F1239]/50'
                }`}
              >
                <div className="flex justify-center mb-2"><ThiingsIcon name="x-circle" pxSize={32} /></div>
                <div className="text-sm font-medium text-[#1C1917]">No Show</div>
              </button>

              <button
                type="button"
                onClick={() => setOutcome('cancelled')}
                className={`p-4 rounded-xl border-2 transition-all ${
                  outcome === 'cancelled'
                    ? 'border-[#d97706] bg-[#d97706]/10'
                    : 'border-[#E7E5E4] hover:border-[#d97706]/50'
                }`}
              >
                <div className="flex justify-center mb-2"><ThiingsIcon name="ban" pxSize={32} /></div>
                <div className="text-sm font-medium text-[#1C1917]">Cancelled</div>
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
                className="w-4 h-4 rounded border-[#E7E5E4] text-[#9F1239] focus:ring-[#9F1239]"
              />
              <label htmlFor="intervention-taken" className="text-sm font-semibold text-[#1C1917]">
                We took action to prevent no-show
              </label>
            </div>

            {interventionTaken && (
              <div className="space-y-4 pl-6">
                {/* Intervention Type */}
                <div>
                  <label className="block text-sm font-medium text-[#1C1917] mb-2">What action did we take?</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setInterventionType('confirmation_call')}
                      className={`p-3 rounded-xl border-2 transition-all ${
                        interventionType === 'confirmation_call'
                          ? 'border-[#9F1239] bg-[#9F1239]/10'
                          : 'border-[#E7E5E4] hover:border-[#9F1239]/50'
                      }`}
                    >
                      <div className="flex justify-center mb-1"><ThiingsIcon name="phone" pxSize={20} /></div>
                      <div className="text-xs font-medium text-[#1C1917]">Call</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setInterventionType('deposit_required')}
                      className={`p-3 rounded-xl border-2 transition-all ${
                        interventionType === 'deposit_required'
                          ? 'border-[#7c3aed] bg-[#7c3aed]/10'
                          : 'border-[#E7E5E4] hover:border-[#7c3aed]/50'
                      }`}
                    >
                      <div className="flex justify-center mb-1"><ThiingsIcon name="credit-card" pxSize={20} /></div>
                      <div className="text-xs font-medium text-[#1C1917]">Deposit</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setInterventionType('premium_seating')}
                      className={`p-3 rounded-xl border-2 transition-all ${
                        interventionType === 'premium_seating'
                          ? 'border-[#d97706] bg-[#d97706]/10'
                          : 'border-[#E7E5E4] hover:border-[#d97706]/50'
                      }`}
                    >
                      <div className="flex justify-center mb-1"><ThiingsIcon name="star" pxSize={20} /></div>
                      <div className="text-xs font-medium text-[#1C1917]">Premium</div>
                    </button>
                  </div>
                </div>

                {/* Intervention Cost */}
                <div>
                  <label htmlFor="cost" className="block text-sm font-medium text-[#1C1917] mb-2">
                    Cost of intervention (€)
                  </label>
                  <input
                    type="number"
                    id="cost"
                    min="0"
                    step="0.5"
                    value={interventionCost}
                    onChange={(e) => setInterventionCost(parseFloat(e.target.value) || 0)}
                    className="w-full px-4 py-2.5 bg-[#F5F5F4] border border-[#E7E5E4] rounded-xl text-[#1C1917] focus:outline-none focus:ring-2 focus:ring-[#9F1239] focus:border-transparent"
                    placeholder="3.00"
                  />
                  <p className="text-xs text-[#A8A29E] mt-1">
                    Staff time, phone costs, or other expenses
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-[#1C1917] mb-2">
              Notes (optional)
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 bg-[#F5F5F4] border border-[#E7E5E4] rounded-xl text-[#1C1917] placeholder-[#A8A29E] focus:outline-none focus:ring-2 focus:ring-[#9F1239] focus:border-transparent"
              placeholder="Any additional context about this reservation..."
            />
          </div>

          {/* Validation error */}
          {validationError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{validationError}</p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 px-4 py-3 border border-[#E7E5E4] text-[#57534E] font-medium rounded-xl hover:bg-[#F5F5F4] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!outcome || isSubmitting}
              className="flex-1 px-4 py-3 bg-[#9F1239] hover:bg-[#881337] text-white rounded-xl font-semibold transition-colors disabled:bg-[#A8A29E] disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Recording...' : 'Record Outcome'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
