/**
 * Record Outcome Modal
 *
 * Records actual reservation outcomes for ML training and ROI calculation
 * Captures: showed_up, no_show, cancelled
 * Records: intervention taken, intervention type, cost
 */

import { useState } from 'react';
import { X, CheckCircle, XCircle, Ban, Phone, CreditCard, Star } from 'lucide-react';
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
      alert('Please select an outcome');
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
    } catch (error) {
      console.error('Error recording outcome:', error);
      alert('Failed to record outcome. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-border">
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Record Outcome</h2>
            <p className="text-sm text-muted-foreground mt-1">Track actual outcome for ML learning</p>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full hover:bg-muted flex items-center justify-center transition-colors"
            disabled={isSubmitting}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Reservation Info */}
          <div className="bg-muted/30 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">{reservation.customer_name}</h3>
              <RiskScoreBadge
                riskScore={reservation.no_show_risk_score}
                riskLevel={reservation.no_show_risk_level}
                confidence={reservation.prediction_confidence}
                size="medium"
              />
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <div>Party of {reservation.party_size} • {reservation.time}</div>
              <div>{reservation.customer_phone}</div>
              {reservation.special_requests && (
                <div className="italic">"{reservation.special_requests}"</div>
              )}
            </div>
          </div>

          {/* Outcome Selection */}
          <div>
            <label className="block text-sm font-semibold mb-3">What happened?</label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setOutcome('showed_up')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  outcome === 'showed_up'
                    ? 'border-emerald-500 bg-emerald-500/10'
                    : 'border-border hover:border-emerald-500/50'
                }`}
              >
                <CheckCircle className={`w-8 h-8 mx-auto mb-2 ${
                  outcome === 'showed_up' ? 'text-emerald-500' : 'text-muted-foreground'
                }`} />
                <div className="text-sm font-medium">Showed Up</div>
              </button>

              <button
                type="button"
                onClick={() => setOutcome('no_show')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  outcome === 'no_show'
                    ? 'border-red-500 bg-red-500/10'
                    : 'border-border hover:border-red-500/50'
                }`}
              >
                <XCircle className={`w-8 h-8 mx-auto mb-2 ${
                  outcome === 'no_show' ? 'text-red-500' : 'text-muted-foreground'
                }`} />
                <div className="text-sm font-medium">No Show</div>
              </button>

              <button
                type="button"
                onClick={() => setOutcome('cancelled')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  outcome === 'cancelled'
                    ? 'border-orange-500 bg-orange-500/10'
                    : 'border-border hover:border-orange-500/50'
                }`}
              >
                <Ban className={`w-8 h-8 mx-auto mb-2 ${
                  outcome === 'cancelled' ? 'text-orange-500' : 'text-muted-foreground'
                }`} />
                <div className="text-sm font-medium">Cancelled</div>
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
                className="w-4 h-4 rounded border-border"
              />
              <label htmlFor="intervention-taken" className="text-sm font-semibold">
                We took action to prevent no-show
              </label>
            </div>

            {interventionTaken && (
              <div className="space-y-4 pl-6">
                {/* Intervention Type */}
                <div>
                  <label className="block text-sm font-medium mb-2">What action did we take?</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setInterventionType('confirmation_call')}
                      className={`p-3 rounded-lg border transition-all ${
                        interventionType === 'confirmation_call'
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-border hover:border-blue-500/50'
                      }`}
                    >
                      <Phone className="w-5 h-5 mx-auto mb-1 text-blue-500" />
                      <div className="text-xs font-medium">Call</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setInterventionType('deposit_required')}
                      className={`p-3 rounded-lg border transition-all ${
                        interventionType === 'deposit_required'
                          ? 'border-purple-500 bg-purple-500/10'
                          : 'border-border hover:border-purple-500/50'
                      }`}
                    >
                      <CreditCard className="w-5 h-5 mx-auto mb-1 text-purple-500" />
                      <div className="text-xs font-medium">Deposit</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setInterventionType('premium_seating')}
                      className={`p-3 rounded-lg border transition-all ${
                        interventionType === 'premium_seating'
                          ? 'border-amber-500 bg-amber-500/10'
                          : 'border-border hover:border-amber-500/50'
                      }`}
                    >
                      <Star className="w-5 h-5 mx-auto mb-1 text-amber-500" />
                      <div className="text-xs font-medium">Premium</div>
                    </button>
                  </div>
                </div>

                {/* Intervention Cost */}
                <div>
                  <label htmlFor="cost" className="block text-sm font-medium mb-2">
                    Cost of intervention (€)
                  </label>
                  <input
                    type="number"
                    id="cost"
                    min="0"
                    step="0.5"
                    value={interventionCost}
                    onChange={(e) => setInterventionCost(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="3.00"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Staff time, phone costs, or other expenses
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="notes" className="block text-sm font-medium mb-2">
              Notes (optional)
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Any additional context about this reservation..."
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 px-4 py-3 bg-muted hover:bg-muted/80 rounded-lg font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!outcome || isSubmitting}
              className="flex-1 px-4 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Recording...' : 'Record Outcome'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
