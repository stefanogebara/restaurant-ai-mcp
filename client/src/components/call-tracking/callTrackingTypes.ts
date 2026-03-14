// ─── Domain types ─────────────────────────────────────────────────────────────

export interface ToolUsed {
  tool_name: string;
  success: boolean;
}

export interface ConversationError {
  error_type: string;
  message: string;
}

export interface TranscriptMessage {
  role: 'user' | 'agent';
  content: string;
}

export interface Conversation {
  id: string;
  conversation_id: string;
  caller_phone: string;
  called_phone: string;
  started_at: string;
  ended_at?: string;
  duration_seconds?: number;
  language: string;
  outcome?: string;
  reservation_id?: string;
  customer_name?: string;
  party_size?: number;
  successful_booking?: boolean;
  customer_sentiment?: string;
  tools_used?: ToolUsed[];
  errors_encountered?: ConversationError[];
  transcript?: TranscriptMessage[];
  summary?: string;
}

export interface Stats {
  overview: {
    total_calls: number;
    successful_bookings: number;
    success_rate: number;
    average_duration_seconds: number;
    average_duration_formatted: string;
  };
  breakdowns: {
    by_outcome: Record<string, number>;
    by_language: Record<string, number>;
    by_day: Record<string, number>;
  };
  top_errors: Array<{ error_type: string; count: number }>;
}

export interface PhoneStatusData {
  name: string;
  has_agent: boolean;
  agent_id: string | null;
  phone_number: string | null;
  phone_number_id: string | null;
  status: 'not_configured' | 'pending' | 'active' | 'error';
  error: string | null;
  configured_at: string | null;
}

export interface DiagnoseData {
  restaurant_name: string;
  agent_id: string;
  agent_name: string;
  has_tools: boolean;
  tool_count: number;
  tools: Array<{ name: string; type: string; url: string | null }>;
  language: string;
  first_message: string;
  prompt_preview: string;
  tool_ids: string[];
  tool_ids_count: number;
}

export interface CallFilter {
  period: string;
  outcome: string;
  language: string;
}

// ─── Helper functions ──────────────────────────────────────────────────────────

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatConfiguredDate(dateString: string | null): string {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getOutcomeColor(outcome?: string): string {
  switch (outcome) {
    case 'reservation_created': return 'bg-green-500/10 text-green-600';
    case 'information_only':    return 'bg-blue-500/10 text-blue-600';
    case 'error':               return 'bg-red-600/10 text-red-600';
    case 'abandoned':           return 'bg-warm-stone/10 text-stone-gray';
    default:                    return 'bg-warm-stone/10 text-stone-gray';
  }
}

/** Returns an i18n key under callTracking.* — caller must pass through t() */
export function getOutcomeLabelKey(outcome?: string): string {
  switch (outcome) {
    case 'reservation_created': return 'callTracking.outcomeReservationCreated';
    case 'information_only':    return 'callTracking.outcomeInformationOnly';
    case 'error':               return 'callTracking.outcomeError';
    case 'abandoned':           return 'callTracking.outcomeAbandonedLabel';
    default:                    return 'callTracking.outcomeUnknown';
  }
}

export function getOutcomePillColor(outcome?: string): string {
  switch (outcome) {
    case 'reservation_created': return 'bg-green-600/[8%] text-green-600';
    case 'information_only':    return 'bg-blue-500/[8%] text-blue-500';
    case 'error':               return 'bg-red-600/[8%] text-red-600';
    case 'abandoned':           return 'bg-amber-600/[8%] text-amber-600';
    default:                    return 'bg-soft-gray text-stone-gray';
  }
}
