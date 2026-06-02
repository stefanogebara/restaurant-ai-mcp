/**
 * Type schema for the chat-based onboarding flow.
 *
 * A flow is an array of {@link Node}s referenced by string `id`. The engine
 * starts at the node with `id === 'start'` (or the explicit `startNodeId`
 * if the caller overrides), shows the bot's `say` lines, waits for the
 * user's answer via the node's input mechanism (clickable {@link Option}s,
 * a free-text {@link InputSlot}, or both), then jumps to the next node
 * named by the matched {@link Branch}.
 *
 * The schema is intentionally narrow — it MUST be possible to type-check
 * an entire flow at compile time so we catch dangling node ids, missing
 * branches, and unknown OnboardingData targets before a user ever sees
 * them.
 */

import type { OnboardingData } from '../../types/onboarding.types';

// ─────────────────────────────────────────────────────────────────────────────
// 1. WHICH FIELDS THE FLOW CAN WRITE TO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The subset of OnboardingData fields the chat is allowed to set. Keeping
 * this as a string literal union (not `keyof OnboardingData`) means adding
 * a new chat-writable field is a deliberate one-line change here, not a
 * silent expansion as the data shape grows.
 *
 * The chat does NOT manage: customer_email (from auth), restaurant_id
 * (from server), plan (from URL/marketing), team_members (post-onboarding),
 * selected_voice_id (post-onboarding setting).
 */
export type OnboardingField =
  | 'restaurant_name'
  | 'restaurant_type'
  | 'city'
  | 'country'
  | 'country_code'
  | 'language'
  | 'phone_number'
  | 'email'
  | 'website'
  | 'business_hours'
  | 'average_dining_duration'
  | 'areas'
  | 'advance_booking_days'
  | 'buffer_time'
  | 'cancellation_policy'
  | 'special_notes';

// ─────────────────────────────────────────────────────────────────────────────
// 2. INPUT MECHANISMS A NODE CAN OFFER
// ─────────────────────────────────────────────────────────────────────────────

/** A clickable button shown to the user. Picking it advances the flow. */
export interface Option {
  /** Stable id used in {@link Branch} predicates. */
  readonly id: string;
  /** Visible button copy. Supports `{varName}` interpolation from FlowState.context. */
  readonly label: string;
  /**
   * Value written to the OnboardingData field named by the node's `writes`,
   * if any. Omit if the option is purely navigational (e.g. "edit", "skip").
   */
  readonly value?: unknown;
}

/**
 * Free-text input slot. The engine collects the raw string, runs the
 * optional `extract` to produce a structured value, then calls `validate`.
 * `kind` is a hint for the UI (e.g. render a tel input for 'phone').
 */
export interface InputSlot {
  readonly kind: 'text' | 'phone' | 'email' | 'url' | 'number' | 'hours' | 'address';
  readonly placeholder?: string;
  /**
   * Server-side LLM extractor key. The engine POSTs to /api/onboarding/extract
   * with `{ kind, key, raw }` and expects `{ ok: true, value }` back, where
   * `value` matches the target field's shape (e.g. BusinessHours[] for
   * `kind: 'hours'`).
   */
  readonly extract?: string;
  /**
   * Client-side guard run on the raw string (or the extracted value if
   * `extract` ran). Return `null` for valid input, an error string to
   * surface back to the user.
   */
  readonly validate?: (raw: string, extracted?: unknown) => string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. WHERE TO GO NEXT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A predicate evaluated against the answer the user just gave. The first
 * branch whose predicate returns true wins and the engine jumps to `next`.
 * Use `{ when: 'always' }` as the catch-all fallback.
 */
export type BranchPredicate =
  | { kind: 'always' }
  | { kind: 'option_id'; equals: string }
  | { kind: 'context'; key: string; equals: unknown };

export interface Branch {
  readonly when: BranchPredicate;
  /** Next node id, or `'__END__'` to finish the flow. */
  readonly next: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. NODES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One step in the conversation. A node always shows one or more bot
 * messages, then waits for the user via `options` (click), `input` (type),
 * or both. After the answer, the engine evaluates `branches` top-to-bottom
 * and jumps to the first match.
 *
 * `writes` declares which OnboardingData field this node's answer populates,
 * so the engine knows where to put the value. A node with no `writes` is
 * purely conversational (acknowledgement, branch-routing, etc).
 */
export interface Node {
  readonly id: string;
  /**
   * Bot turns shown before waiting for user input. Each string is one
   * bubble. Supports `{varName}` interpolation from FlowState.context.
   */
  readonly say: readonly string[];
  readonly writes?: OnboardingField;
  readonly options?: readonly Option[];
  readonly input?: InputSlot;
  readonly branches: readonly Branch[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. RUNTIME STATE
// ─────────────────────────────────────────────────────────────────────────────

/** A finalised message in the chat transcript. */
export interface ChatMessage {
  readonly id: string;
  readonly turn: 'bot' | 'user';
  readonly text: string;
  /** The node id this message belongs to — used for "edit this answer" jumps. */
  readonly nodeId: string;
}

/**
 * Snapshot of the running conversation. The reducer in engine.ts is a pure
 * function over this — no React, no fetch. UI subscribes to it and renders
 * `messages` + the prompt at `currentNodeId`.
 */
export interface FlowState {
  readonly currentNodeId: string;
  /** Append-only transcript. */
  readonly messages: readonly ChatMessage[];
  /**
   * Accumulated OnboardingData. Partial because the user may not have
   * answered everything yet.
   */
  readonly data: Partial<OnboardingData>;
  /**
   * Free-form key/value bag the flow can read from in `{var}` interpolation
   * and in `BranchPredicate.kind === 'context'`. Used for derived values
   * (e.g. cuisine type confidence, scraper hit count) that aren't part of
   * OnboardingData but matter for routing.
   */
  readonly context: Readonly<Record<string, unknown>>;
  /** True once we hit `'__END__'`. */
  readonly done: boolean;
  /** Validation error from the last answer, surfaced inline. */
  readonly lastError: string | null;
}

/** Sentinel node id meaning "flow finished — submit". */
export const END = '__END__' as const;

/**
 * The static flow definition. Indexed by id for O(1) lookup; the engine
 * trusts that every Branch.next referenced is either `END` or present in
 * this map. The {@link validateFlow} helper checks that invariant.
 */
export type Flow = ReadonlyMap<string, Node>;
