import { useState, useEffect } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useToast } from '../../contexts/ToastContext';
import type { ActiveParty } from '../../types/host.types';
import { useCompleteService } from '../../hooks/useCompleteService';
import { formatTimeAgo } from '../../utils/timeFormatting';
import ThiingsIcon from '../common/ThiingsIcon';

interface ActivePartiesListProps {
  parties: ActiveParty[];
}

interface DraggablePartyCardProps {
  party: ActiveParty;
  children: React.ReactNode;
}

function DraggablePartyCard({ party, children }: DraggablePartyCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: party.service_id,
    data: {
      type: 'party',
      party
    }
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    cursor: isDragging ? 'grabbing' : 'grab'
  };

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      {children}
    </div>
  );
}

function LiveCountdown({ seatedMinutesAgo, estimatedDurationMinutes }: { seatedMinutesAgo: number; estimatedDurationMinutes: number }) {
  const [elapsedMinutes, setElapsedMinutes] = useState(seatedMinutesAgo);
  const remainingMinutes = estimatedDurationMinutes - elapsedMinutes;
  const isOverdue = remainingMinutes < 0;

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedMinutes((prev) => prev + 1);
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  // Format time using consistent utility pattern
  const formatTime = (minutes: number, isOverdue: boolean): { text: string; showWarning: boolean } => {
    const absMinutes = Math.abs(minutes);
    const hours = Math.floor(absMinutes / 60);
    const mins = absMinutes % 60;

    if (isOverdue) {
      if (hours >= 1) {
        const text = mins === 0 ? `${hours}h OVERDUE` : `${hours}h ${mins}m OVERDUE`;
        return { text, showWarning: true };
      }
      return { text: `${absMinutes}m OVERDUE`, showWarning: true };
    }

    if (hours >= 1) {
      const text = mins === 0 ? `${hours}h left` : `${hours}h ${mins}m left`;
      return { text, showWarning: false };
    }
    return { text: `${absMinutes}m left`, showWarning: false };
  };

  const { text, showWarning } = formatTime(remainingMinutes, isOverdue);

  return (
    <span className={`font-semibold flex items-center gap-1 ${isOverdue ? 'text-burgundy' : 'text-[#16a34a]'}`}>
      {showWarning && <ThiingsIcon name="alert-triangle" size="xs" />}
      {text}
    </span>
  );
}

export default function ActivePartiesList({ parties }: ActivePartiesListProps) {
  const [confirmingServiceId, setConfirmingServiceId] = useState<string | null>(null);
  const completeServiceMutation = useCompleteService();
  const { success, error: showError } = useToast();

  if (parties.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 mx-auto mb-3 bg-soft-gray rounded-xl flex items-center justify-center">
          <ThiingsIcon name="dining" size="md" />
        </div>
        <div className="text-sm text-stone-gray">No active parties</div>
      </div>
    );
  }

  const handleCompleteService = (serviceId: string, partyName: string) => {
    completeServiceMutation.mutate(serviceId, {
      onSuccess: () => {
        setConfirmingServiceId(null);
        success(`Service completed for ${partyName}`);
      },
      onError: () => {
        showError('Failed to complete service');
      },
    });
  };

  return (
    <div className="space-y-3">
      {parties.map((party) => (
        <DraggablePartyCard key={party.service_id} party={party}>
          <div className="bg-white border border-border-gray rounded-xl p-4 hover:bg-soft-gray transition-all relative shadow-md">
            {/* Drag handle indicator */}
            <div className="absolute top-2 right-2 text-muted-stone text-xs flex items-center gap-1">
              <ThiingsIcon name="menu" size="xs" />
              <span>Drag to table</span>
            </div>
          <div className="flex justify-between items-start mb-3">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <div className="font-semibold text-deep-charcoal text-lg">{party.customer_name}</div>
                {/* Running Late indicator - shows when less than 10 minutes remaining */}
                {!party.is_overdue && party.time_remaining_minutes > 0 && party.time_remaining_minutes <= 10 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#d97706]/10 text-[#d97706] text-xs font-semibold rounded-full animate-pulse">
                    <ThiingsIcon name="clock" size="xs" pxSize={12} />
                    Running Late
                  </span>
                )}
              </div>
              <div className="text-sm text-stone-gray mt-0.5">Party of {party.party_size}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-stone mb-1">Tables</div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-burgundy/10 text-burgundy rounded-lg text-sm font-semibold">
                {party.tables.join(', ')}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs mb-3 pb-3 border-b border-border-gray">
            <div className="flex items-center gap-1.5 text-stone-gray">
              <ThiingsIcon name="clock" size="xs" pxSize={14} />
              <span>Seated {formatTimeAgo(new Date(Date.now() - party.time_elapsed_minutes * 60000))}</span>
            </div>
            <LiveCountdown
              seatedMinutesAgo={party.time_elapsed_minutes}
              estimatedDurationMinutes={party.time_elapsed_minutes + party.time_remaining_minutes}
            />
          </div>

          {confirmingServiceId === party.service_id ? (
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmingServiceId(null)}
                className="flex-1 px-3 py-2 text-sm bg-soft-gray text-stone-gray border border-border-gray rounded-lg hover:bg-border-gray transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={completeServiceMutation.isPending}
              >
                Cancel
              </button>
              <button
                onClick={() => handleCompleteService(party.service_id, party.customer_name)}
                className="flex-1 px-3 py-2 text-sm bg-[#16a34a] hover:bg-[#15803d] text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={completeServiceMutation.isPending}
              >
                {completeServiceMutation.isPending && (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                )}
                {completeServiceMutation.isPending ? 'Completing...' : 'Confirm'}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingServiceId(party.service_id)}
              className="w-full px-3 py-2 text-sm bg-deep-charcoal hover:bg-burgundy text-white font-medium rounded-lg transition-all"
            >
              Complete Service
            </button>
          )}
          </div>
        </DraggablePartyCard>
      ))}
    </div>
  );
}
