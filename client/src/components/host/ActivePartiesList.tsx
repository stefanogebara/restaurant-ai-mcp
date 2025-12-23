import { useState, useEffect } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useToast } from '../../contexts/ToastContext';
import type { ActiveParty } from '../../types/host.types';
import { useCompleteService } from '../../hooks/useCompleteService';
import { formatTimeAgo } from '../../utils/timeFormatting';

// SVG Icon Components
const DiningIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 20 20" fill="currentColor">
    <path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z" />
  </svg>
);

const WarningIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
  </svg>
);

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
    <span className={`font-semibold flex items-center gap-1 ${isOverdue ? 'text-[#9F1239]' : 'text-[#16a34a]'}`}>
      {showWarning && <WarningIcon className="w-4 h-4" />}
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
        <div className="w-16 h-16 mx-auto mb-3 bg-[#F5F5F4] rounded-xl flex items-center justify-center">
          <DiningIcon className="w-8 h-8 text-[#A8A29E]" />
        </div>
        <div className="text-sm text-[#57534E]">No active parties</div>
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
          <div className="bg-white border border-[#E7E5E4] rounded-xl p-4 hover:bg-[#F5F5F4] transition-all relative shadow-md">
            {/* Drag handle indicator */}
            <div className="absolute top-2 right-2 text-[#A8A29E] text-xs flex items-center gap-1">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
              <span>Drag to table</span>
            </div>
          <div className="flex justify-between items-start mb-3">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <div className="font-semibold text-[#1C1917] text-lg">{party.customer_name}</div>
                {/* Running Late indicator - shows when less than 10 minutes remaining */}
                {!party.is_overdue && party.time_remaining_minutes > 0 && party.time_remaining_minutes <= 10 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#d97706]/10 text-[#d97706] text-xs font-semibold rounded-full animate-pulse">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                    </svg>
                    Running Late
                  </span>
                )}
              </div>
              <div className="text-sm text-[#57534E] mt-0.5">Party of {party.party_size}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-[#A8A29E] mb-1">Tables</div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#9F1239]/10 text-[#9F1239] rounded-lg text-sm font-semibold">
                {party.tables.join(', ')}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs mb-3 pb-3 border-b border-[#E7E5E4]">
            <div className="flex items-center gap-1.5 text-[#57534E]">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
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
                className="flex-1 px-3 py-2 text-sm bg-[#F5F5F4] text-[#57534E] border border-[#E7E5E4] rounded-lg hover:bg-[#E7E5E4] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
              className="w-full px-3 py-2 text-sm bg-[#1C1917] hover:bg-[#9F1239] text-white font-medium rounded-lg transition-all"
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
