/**
 * Quick Intervention Modal
 *
 * Shows reservation details and risk information with quick action
 * buttons for logging interventions on high-risk reservations.
 */

import { useState } from 'react';
import { authFetch } from '../../services/api';
import ThiingsIcon from '../common/ThiingsIcon';
import type { IconName } from '../common/ThiingsIcon';
import Spinner from '../common/Spinner';

interface Reservation {
  reservation_id: string;
  customer_name: string;
  customer_phone?: string;
  party_size: number;
  date: string;
  time: string;
  ml_risk_score?: number;
  ml_risk_level?: string;
  ml_risk_factors?: Array<{ factor: string; description: string; weight: number }>;
  special_requests?: string;
  intervention_taken?: boolean;
  intervention_type?: string;
}

interface QuickInterventionModalProps {
  reservation: Reservation;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  language?: 'en' | 'es';
}

export default function QuickInterventionModal({
  reservation,
  isOpen,
  onClose,
  onSuccess,
  language = 'en'
}: QuickInterventionModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [staffName, setStaffName] = useState('');
  const [notes, setNotes] = useState('');

  const translations = {
    en: {
      title: 'Take Action',
      riskScore: 'Risk Score',
      riskFactors: 'Risk Factors',
      quickActions: 'Quick Actions',
      called: 'Called Customer',
      sentSMS: 'Sent SMS',
      sentWhatsApp: 'Sent WhatsApp',
      depositRequired: 'Deposit Required',
      other: 'Other Action',
      staffName: 'Your Name',
      staffPlaceholder: 'Enter your name',
      notes: 'Notes',
      notesPlaceholder: 'Customer confirmed, will arrive on time...',
      cancel: 'Cancel',
      save: 'Log Intervention',
      saving: 'Saving...',
      success: 'Intervention logged successfully!',
      errorSelect: 'Please select an action',
      errorSave: 'Failed to log intervention',
      alreadyTaken: 'Intervention already recorded',
      people: 'people'
    },
    es: {
      title: 'Tomar Acción',
      riskScore: 'Puntuación de Riesgo',
      riskFactors: 'Factores de Riesgo',
      quickActions: 'Acciones Rápidas',
      called: 'Llamé al Cliente',
      sentSMS: 'Envié SMS',
      sentWhatsApp: 'Envié WhatsApp',
      depositRequired: 'Depósito Requerido',
      other: 'Otra Acción',
      staffName: 'Tu Nombre',
      staffPlaceholder: 'Ingresa tu nombre',
      notes: 'Notas',
      notesPlaceholder: 'Cliente confirmó, llegará a tiempo...',
      cancel: 'Cancelar',
      save: 'Registrar Intervención',
      saving: 'Guardando...',
      success: '¡Intervención registrada exitosamente!',
      errorSelect: 'Por favor selecciona una acción',
      errorSave: 'Error al registrar la intervención',
      alreadyTaken: 'Intervención ya registrada',
      people: 'personas'
    }
  };

  const t = translations[language];

  const actionOptions: Array<{ id: string; label: string; icon: IconName; color: string }> = [
    { id: 'phone_call', label: t.called, icon: 'phone', color: 'bg-blue-500' },
    { id: 'sms_reminder', label: t.sentSMS, icon: 'chat', color: 'bg-green-500' },
    { id: 'whatsapp_reminder', label: t.sentWhatsApp, icon: 'chat', color: 'bg-emerald-500' },
    { id: 'deposit_required', label: t.depositRequired, icon: 'credit-card', color: 'bg-violet-500' },
    { id: 'other', label: t.other, icon: 'check-circle', color: 'bg-warm-stone' }
  ];

  const getRiskColor = (level?: string) => {
    switch (level) {
      case 'very-high': return 'bg-red-600/15 text-red-800 border-red-600/30';
      case 'high': return 'bg-orange-600/15 text-orange-800 border-orange-600/30';
      case 'medium': return 'bg-amber-600/15 text-amber-800 border-amber-600/30';
      default: return 'bg-green-500/15 text-emerald-800 border-green-500/30';
    }
  };

  const handleSubmit = async () => {
    if (!selectedAction) {
      setError(t.errorSelect);
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const response = await authFetch('/api/ml-outcomes?action=mark-action-taken', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservation_id: reservation.reservation_id,
          intervention_type: selectedAction,
          staff_name: staffName,
          notes: notes
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || t.errorSave);
      }

      setSuccess(true);

      // Close after a brief delay to show success state
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1000);

    } catch (err) {
      console.error('Error logging intervention:', err);
      setError(err instanceof Error ? err.message : t.errorSave);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white px-6 py-4 border-b border-border-gray flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-600/15 rounded-xl">
              <ThiingsIcon name="alert-triangle" size="sm" />
            </div>
            <h2 className="text-xl font-bold text-deep-charcoal">{t.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-soft-gray rounded-xl transition-colors"
          >
            <ThiingsIcon name="x-circle" size="sm" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Reservation Info */}
          <div className="bg-soft-gray rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ThiingsIcon name="user" size="xs" />
                <span className="font-semibold text-deep-charcoal">{reservation.customer_name}</span>
              </div>
              <div className={`px-2 py-1 rounded-lg border text-xs font-bold ${getRiskColor(reservation.ml_risk_level)}`}>
                {reservation.ml_risk_level?.toUpperCase().replace('-', ' ')} {reservation.ml_risk_score}%
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm text-stone-gray">
              <div className="flex items-center gap-1">
                <ThiingsIcon name="calendar" pxSize={14} />
                <span>{reservation.date}</span>
              </div>
              <div className="flex items-center gap-1">
                <ThiingsIcon name="clock" pxSize={14} />
                <span>{reservation.time}</span>
              </div>
              <div className="flex items-center gap-1">
                <ThiingsIcon name="users" pxSize={14} />
                <span>{reservation.party_size} {t.people}</span>
              </div>
            </div>
            {reservation.customer_phone && (
              <div className="mt-2 text-sm text-stone-gray flex items-center gap-1">
                <ThiingsIcon name="phone" pxSize={14} />
                <span>{reservation.customer_phone}</span>
              </div>
            )}
          </div>

          {/* Risk Factors */}
          {reservation.ml_risk_factors && reservation.ml_risk_factors.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-deep-charcoal mb-2">{t.riskFactors}</h3>
              <div className="space-y-1">
                {reservation.ml_risk_factors.slice(0, 3).map((factor, idx) => (
                  <div key={idx} className="text-sm text-stone-gray flex items-start gap-2">
                    <span className="text-orange-600">•</span>
                    <span>{factor.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Already taken indicator */}
          {reservation.intervention_taken && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 flex items-center gap-2">
              <ThiingsIcon name="check-circle" size="sm" />
              <div>
                <span className="text-emerald-800 font-medium">{t.alreadyTaken}</span>
                {reservation.intervention_type && (
                  <span className="text-green-600 text-sm ml-2">
                    ({reservation.intervention_type.replace('_', ' ')})
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Quick Actions */}
          {!success && (
            <>
              <div>
                <h3 className="text-sm font-semibold text-deep-charcoal mb-3">{t.quickActions}</h3>
                <div className="grid grid-cols-2 gap-2">
                  {actionOptions.map((action) => {
                    const isSelected = selectedAction === action.id;
                    return (
                      <button
                        key={action.id}
                        onClick={() => setSelectedAction(action.id)}
                        className={`flex items-center gap-2 p-3 rounded-2xl border-2 transition-all ${
                          isSelected
                            ? 'border-burgundy bg-burgundy/5'
                            : 'border-border-gray hover:border-burgundy/50 hover:bg-soft-gray'
                        }`}
                      >
                        <div className={`p-1.5 rounded-lg ${action.color}`}>
                          <ThiingsIcon name={action.icon} size="xs" />
                        </div>
                        <span className={`text-sm font-medium ${isSelected ? 'text-burgundy' : 'text-deep-charcoal'}`}>
                          {action.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Staff Name */}
              <div>
                <label className="block text-sm font-medium text-deep-charcoal mb-1">
                  {t.staffName}
                </label>
                <input
                  type="text"
                  value={staffName}
                  onChange={(e) => setStaffName(e.target.value)}
                  placeholder={t.staffPlaceholder}
                  className="w-full px-4 py-2 border border-border-gray rounded-xl focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy transition-colors"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-deep-charcoal mb-1">
                  {t.notes}
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t.notesPlaceholder}
                  rows={2}
                  className="w-full px-4 py-2 border border-border-gray rounded-xl focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy transition-colors resize-none"
                />
              </div>
            </>
          )}

          {/* Success State */}
          {success && (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-green-500/15 rounded-full flex items-center justify-center mx-auto mb-4">
                <ThiingsIcon name="check-circle" pxSize={32} />
              </div>
              <p className="text-lg font-semibold text-emerald-800">{t.success}</p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-600/10 border border-red-600/20 rounded-xl text-red-600 text-sm">
              {error}
            </div>
          )}

          {/* Actions */}
          {!success && (
            <div className="flex gap-3 pt-2">
              <button
                onClick={onClose}
                disabled={isLoading}
                className="flex-1 px-4 py-3 border border-border-gray rounded-xl text-stone-gray font-medium hover:bg-soft-gray transition-colors disabled:opacity-50"
              >
                {t.cancel}
              </button>
              <button
                onClick={handleSubmit}
                disabled={isLoading || !selectedAction}
                className="flex-1 px-4 py-3 bg-burgundy hover:bg-burgundy-dark text-white font-medium rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Spinner size="sm" />
                    {t.saving}
                  </>
                ) : (
                  <>
                    <ThiingsIcon name="check-circle" size="xs" />
                    {t.save}
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
