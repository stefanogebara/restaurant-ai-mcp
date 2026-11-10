// ─── Domain types ─────────────────────────────────────────────────────────────

export interface ToolUsed {
  tool_name: string;
  parameters?: Record<string, unknown>;
  success?: boolean | null;
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
  language: string | null;
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
  recording_url?: string;
}

export interface Stats {
  overview: {
    total_calls: number;
    successful_bookings: number;
    success_rate: number;
    completed_calls: number;
    completion_rate: number;
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
  /** Eligible saved shared setup; never proof of a live phone route. */
  shared_routing_enabled?: boolean;
  name: string;
  has_agent: boolean;
  agent_id: string | null;
  phone_number: string | null;
  phone_number_id: string | null;
  status: 'not_configured' | 'pending' | 'active' | 'needs_review' | 'error';
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
  sentiment?: string;
  search?: string;
}

export type CallChannel = 'phone' | 'unclassified';

// ─── Helper functions ──────────────────────────────────────────────────────────

export function isValidTimeZone(timeZone: string | null | undefined): timeZone is string {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
}

function formatCallPart(
  dateString: string | null | undefined,
  locale: string | undefined,
  timeZone: string | undefined,
  options: Intl.DateTimeFormatOptions,
): string {
  if (!dateString) return '';
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleString(locale, { ...options, timeZone });
  } catch (error) {
    // A stale or invalid restaurant timezone must not break the Calls page.
    if (!(error instanceof RangeError)) throw error;
    return d.toLocaleString(locale, options);
  }
}

export function formatDate(dateString: string | null | undefined, locale?: string, timeZone?: string): string {
  return formatCallPart(dateString, locale, timeZone, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatCallTime(dateString: string | null | undefined, locale?: string, timeZone?: string): string {
  return formatCallPart(dateString, locale, timeZone, { hour: '2-digit', minute: '2-digit' });
}

export function formatCallExportDate(dateString: string | null | undefined, locale?: string, timeZone?: string): string {
  return formatCallPart(dateString, locale, timeZone, {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export function formatConfiguredDate(dateString: string | null): string {
  if (!dateString) return 'N/A';
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return 'N/A';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getOutcomeColor(outcome?: string): string {
  return getOutcomePillColor(outcome);
}

/** Returns an i18n key under callTracking.* — caller must pass through t() */
export function getOutcomeLabelKey(outcome?: string): string {
  switch (outcome) {
    case 'reservation_created': return 'callTracking.outcomeReservationCreated';
    case 'reservation_modified': return 'callTracking.outcomeReservationModified';
    case 'reservation_cancelled': return 'callTracking.outcomeReservationCancelled';
    case 'information_only':    return 'callTracking.outcomeInformationOnly';
    case 'error':               return 'callTracking.outcomeError';
    case 'abandoned':           return 'callTracking.outcomeAbandonedLabel';
    default:                    return 'callTracking.outcomeUnknown';
  }
}

export function getSentimentColor(sentiment?: string): string {
  switch (sentiment) {
    case 'positive': return 'bg-emerald-500/10 text-emerald-600';
    case 'neutral':  return 'bg-stone-500/10 text-stone-600';
    case 'negative': return 'bg-red-600/10 text-red-600';
    default:         return 'bg-warm-stone/10 text-stone-gray';
  }
}

/** Returns an i18n key under callTracking.* — caller must pass through t() */
export function getSentimentLabelKey(sentiment?: string): string {
  switch (sentiment) {
    case 'positive': return 'callTracking.sentimentPositive';
    case 'neutral':  return 'callTracking.sentimentNeutral';
    case 'negative': return 'callTracking.sentimentNegative';
    default:         return 'callTracking.sentimentUnknown';
  }
}

export function getOutcomePillColor(outcome?: string): string {
  switch (outcome) {
    case 'reservation_created': return 'bg-emerald-600/[8%] text-emerald-700';
    case 'reservation_modified': return 'bg-emerald-600/[8%] text-emerald-700';
    case 'reservation_cancelled': return 'bg-amber-600/[8%] text-amber-700';
    case 'information_only':    return 'bg-stone-500/[8%] text-stone-500';
    case 'error':               return 'bg-red-600/[8%] text-red-600';
    case 'abandoned':           return 'bg-amber-600/[8%] text-amber-600';
    default:                    return 'bg-soft-gray text-stone-gray';
  }
}
