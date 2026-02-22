/**
 * Intervention Recommendations Panel
 *
 * Displays high-risk reservations that need host attention
 * Shows recommended interventions with one-click action buttons
 * Automatically marks interventions as taken and updates ML tracking
 */

import { useState } from 'react';
import { authFetch } from '../../services/api';
import ThiingsIcon from '../common/ThiingsIcon';
import type { UpcomingReservation } from '../../types/host.types';
import RiskScoreBadge from './RiskScoreBadge';
import RiskExplanationModal from './RiskExplanationModal';

interface InterventionPanelProps {
  reservations: UpcomingReservation[];
  onRecordIntervention: (reservation: UpcomingReservation, interventionType: string) => void;
}

export default function InterventionPanel({
  reservations,
  onRecordIntervention
}: InterventionPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [actedReservations, setActedReservations] = useState<Set<string>>(new Set());
  const [selectedReservation, setSelectedReservation] = useState<UpcomingReservation | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);

  // Filter to high and very-high risk reservations
  const highRiskReservations = reservations.filter(
    r => r.no_show_risk_level === 'high' || r.no_show_risk_level === 'very-high'
  );

  // Handle intervention action
  const handleAction = async (reservation: UpcomingReservation, interventionType: string) => {
    // Record the intervention
    onRecordIntervention(reservation, interventionType);

    // Mark as acted locally for UI feedback
    setActedReservations(prev => new Set(prev).add(reservation.reservation_id));

    // Call API to mark intervention as taken
    try {
      await authFetch('/api/ml-outcomes?action=mark-action-taken', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservation_id: reservation.reservation_id,
          intervention_type: interventionType,
          notes: `Action taken via dashboard at ${new Date().toLocaleString()}`
        })
      });
    } catch (error) {
      console.error('Error marking intervention:', error);
    }
  };

  // Calculate time until reservation
  const getTimeUntilReservation = (reservationTime: string) => {
    const now = new Date();
    const resTime = new Date(reservationTime);
    const diffMs = resTime.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (diffMs < 0) return 'Past due';
    if (diffHours < 1) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h ${diffMins}m`;
    return `${Math.floor(diffHours / 24)}d`;
  };

  // Calculate potential value at risk
  const calculatePotentialValue = (partySize: number) => {
    const avgRevenuePerPerson = 50; // €50 per person
    return partySize * avgRevenuePerPerson;
  };

  // If no high-risk reservations, show success state
  if (highRiskReservations.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-border-gray p-6 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-green-600/10 flex items-center justify-center">
            <ThiingsIcon name="star" pxSize={24} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-deep-charcoal">All Clear!</h3>
            <p className="text-sm text-stone-gray">No high-risk reservations need attention</p>
          </div>
        </div>
      </div>
    );
  }

  // Sort by risk score descending, then by time
  const sortedReservations = [...highRiskReservations].sort((a, b) => {
    // First by risk level
    const riskOrder = { 'very-high': 4, 'high': 3, 'medium': 2, 'low': 1 };
    const riskDiff = (riskOrder[b.no_show_risk_level as keyof typeof riskOrder] || 0) -
                     (riskOrder[a.no_show_risk_level as keyof typeof riskOrder] || 0);
    if (riskDiff !== 0) return riskDiff;

    // Then by time (sooner first)
    return new Date(a.reservation_time).getTime() - new Date(b.reservation_time).getTime();
  });

  return (
    <div className="bg-white rounded-xl border border-border-gray shadow-md">
      {/* Header */}
      <div
        className="p-4 border-b border-border-gray cursor-pointer hover:bg-soft-gray transition-colors rounded-t-xl"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-600/10 flex items-center justify-center animate-pulse">
              <ThiingsIcon name="alert-triangle" pxSize={20} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-deep-charcoal">Intervention Needed</h3>
              <p className="text-sm text-stone-gray">
                {highRiskReservations.length} high-risk reservation{highRiskReservations.length !== 1 ? 's' : ''} •
                <span className="ml-1 font-medium text-amber-600">
                  €{sortedReservations.reduce((sum, r) => sum + calculatePotentialValue(r.party_size), 0)} at risk
                </span>
              </p>
            </div>
          </div>
          {isExpanded ? (
            <ThiingsIcon name="chevron-up" pxSize={20} />
          ) : (
            <ThiingsIcon name="chevron-down" pxSize={20} />
          )}
        </div>
      </div>

      {/* Reservation List */}
      {isExpanded && (
        <div className="divide-y divide-border-gray max-h-[600px] overflow-y-auto">
          {sortedReservations.map((reservation) => {
            const hasActed = actedReservations.has(reservation.reservation_id);
            const potentialValue = calculatePotentialValue(reservation.party_size);
            const timeUntil = getTimeUntilReservation(reservation.reservation_time);

            return (
              <div
                key={reservation.reservation_id}
                className={`p-4 transition-colors ${hasActed ? 'bg-green-600/5' : 'hover:bg-soft-gray'}`}
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Reservation Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <h4 className="font-semibold text-deep-charcoal">{reservation.customer_name}</h4>
                      <button
                        onClick={() => {
                          setSelectedReservation(reservation);
                          setShowExplanation(true);
                        }}
                        className="hover:scale-105 transition-transform"
                        title="Click to see why this reservation is flagged"
                      >
                        <RiskScoreBadge
                          riskScore={reservation.no_show_risk_score}
                          riskLevel={reservation.no_show_risk_level}
                          confidence={reservation.prediction_confidence}
                          size="small"
                        />
                      </button>
                      {hasActed && (
                        <span className="px-2 py-0.5 bg-green-600/10 text-green-600 text-xs font-medium rounded-full">
                          ✓ Contacted
                        </span>
                      )}
                    </div>

                    <div className="text-sm text-stone-gray space-y-1.5">
                      <div className="flex items-center gap-4 flex-wrap">
                        <span className="font-medium">Party of {reservation.party_size}</span>
                        <span>•</span>
                        <span>{reservation.time}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <ThiingsIcon name="clock" pxSize={12} />
                          {timeUntil}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-soft-gray px-2 py-0.5 rounded border border-border-gray">
                          {reservation.customer_phone}
                        </span>
                      </div>

                      <div className="text-xs text-amber-600 font-medium">
                        €{potentialValue} potential revenue at risk
                      </div>

                      {reservation.special_requests && (
                        <div className="text-xs italic text-stone-gray bg-soft-gray p-2 rounded mt-2 border border-border-gray">
                          "{reservation.special_requests}"
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="flex flex-col gap-2 min-w-[120px]">
                    {/* Call Button - Direct tel: link */}
                    <a
                      href={`tel:${reservation.customer_phone}`}
                      onClick={() => handleAction(reservation, 'confirmation_call')}
                      className="px-3 py-2 bg-burgundy/10 hover:bg-burgundy/20 text-burgundy rounded-lg text-sm font-medium flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
                      title="Call customer to confirm"
                    >
                      <ThiingsIcon name="phone" pxSize={16} />
                      Call Now
                    </a>

                    {/* SMS Button */}
                    <a
                      href={`sms:${reservation.customer_phone}?body=Hi ${reservation.customer_name}, this is [Restaurant Name]. We're looking forward to seeing you at ${reservation.time} today!`}
                      onClick={() => handleAction(reservation, 'sms_reminder')}
                      className="px-3 py-2 bg-green-600/10 hover:bg-green-600/20 text-green-600 rounded-lg text-sm font-medium flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
                      title="Send SMS reminder"
                    >
                      <ThiingsIcon name="mail" pxSize={16} />
                      SMS
                    </a>

                    {/* Deposit Button */}
                    <button
                      onClick={() => handleAction(reservation, 'deposit_required')}
                      className="px-3 py-2 bg-violet-600/10 hover:bg-violet-600/20 text-violet-600 rounded-lg text-sm font-medium flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
                      title="Require deposit"
                    >
                      <ThiingsIcon name="credit-card" pxSize={16} />
                      Deposit
                    </button>

                    {/* Premium Seating Button */}
                    <button
                      onClick={() => handleAction(reservation, 'premium_seating')}
                      className="px-3 py-2 bg-amber-600/10 hover:bg-amber-600/20 text-amber-600 rounded-lg text-sm font-medium flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
                      title="Offer premium seating"
                    >
                      <ThiingsIcon name="star" pxSize={16} />
                      VIP Seat
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Risk Explanation Modal */}
      {selectedReservation && (
        <RiskExplanationModal
          isOpen={showExplanation}
          onClose={() => {
            setShowExplanation(false);
            setSelectedReservation(null);
          }}
          reservation={{
            customer_name: selectedReservation.customer_name,
            party_size: selectedReservation.party_size,
            date: selectedReservation.date,
            time: selectedReservation.time,
            ml_risk_score: selectedReservation.no_show_risk_score,
            ml_risk_level: selectedReservation.no_show_risk_level,
            ml_confidence: selectedReservation.prediction_confidence
          }}
          riskFactors={selectedReservation.ml_risk_factors || []}
        />
      )}
    </div>
  );
}
