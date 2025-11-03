/**
 * Intervention Recommendations Panel
 *
 * Displays high-risk reservations that need host attention
 * Shows recommended interventions with quick action buttons
 */

import { useState } from 'react';
import { AlertTriangle, Phone, CreditCard, Star, ChevronDown, ChevronUp } from 'lucide-react';
import type { UpcomingReservation } from '../../types/host.types';
import RiskScoreBadge from './RiskScoreBadge';

interface InterventionPanelProps {
  reservations: UpcomingReservation[];
  onRecordIntervention: (reservation: UpcomingReservation, interventionType: string) => void;
}

export default function InterventionPanel({
  reservations,
  onRecordIntervention
}: InterventionPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  // Filter to high and very-high risk reservations
  const highRiskReservations = reservations.filter(
    r => r.no_show_risk_level === 'high' || r.no_show_risk_level === 'very-high'
  );

  // If no high-risk reservations, show success state
  if (highRiskReservations.length === 0) {
    return (
      <div className="bg-card rounded-lg border border-border p-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <Star className="w-6 h-6 text-emerald-500" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">All Clear!</h3>
            <p className="text-sm text-muted-foreground">No high-risk reservations need attention</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg border border-border">
      {/* Header */}
      <div
        className="p-4 border-b border-border cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Intervention Needed</h3>
              <p className="text-sm text-muted-foreground">
                {highRiskReservations.length} high-risk reservation{highRiskReservations.length !== 1 ? 's' : ''} need attention
              </p>
            </div>
          </div>
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Reservation List */}
      {isExpanded && (
        <div className="divide-y divide-border">
          {highRiskReservations.map((reservation) => (
            <div key={reservation.reservation_id} className="p-4 hover:bg-muted/30 transition-colors">
              <div className="flex items-start justify-between gap-4">
                {/* Reservation Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h4 className="font-semibold text-foreground">{reservation.customer_name}</h4>
                    <RiskScoreBadge
                      riskScore={reservation.no_show_risk_score}
                      riskLevel={reservation.no_show_risk_level}
                      confidence={reservation.prediction_confidence}
                      size="small"
                    />
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <div>Party of {reservation.party_size} • {reservation.time}</div>
                    <div>{reservation.customer_phone}</div>
                    {reservation.special_requests && (
                      <div className="text-xs italic">"{reservation.special_requests}"</div>
                    )}
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => onRecordIntervention(reservation, 'confirmation_call')}
                    className="px-3 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-md text-sm font-medium flex items-center gap-2 transition-colors"
                    title="Call customer to confirm"
                  >
                    <Phone className="w-4 h-4" />
                    Call
                  </button>
                  <button
                    onClick={() => onRecordIntervention(reservation, 'deposit_required')}
                    className="px-3 py-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 rounded-md text-sm font-medium flex items-center gap-2 transition-colors"
                    title="Require deposit"
                  >
                    <CreditCard className="w-4 h-4" />
                    Deposit
                  </button>
                  <button
                    onClick={() => onRecordIntervention(reservation, 'premium_seating')}
                    className="px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-md text-sm font-medium flex items-center gap-2 transition-colors"
                    title="Offer premium seating"
                  >
                    <Star className="w-4 h-4" />
                    Premium
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
