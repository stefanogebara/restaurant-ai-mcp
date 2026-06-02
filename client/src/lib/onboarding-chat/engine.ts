/**
 * Pure reducer for the chat-based onboarding flow.
 *
 *   const state0 = init(flow, { context: { ...initial } });
 *   const state1 = advance(flow, state0, { kind: 'option', optionId: 'go' });
 *
 * No fetch. No React. No setTimeout. Every state transition is a function
 * call. The UI binds advance() to user actions; the network/extractor layer
 * sits OUTSIDE the engine and feeds resolved values back in via Answer.
 *
 * Design notes:
 *   - State is immutable. Every transition returns a new FlowState.
 *   - `messages` is append-only — the transcript is the audit log for
 *     "edit my previous answer" jumps later.
 *   - When validation fails we DON'T advance: the same node stays current
 *     and `lastError` is populated so the UI can show the inline error.
 *     The user retries from the same prompt.
 *   - Branch predicates are evaluated top-to-bottom and the first match
 *     wins. validateFlow guarantees the last one is the `{ kind: 'always' }`
 *     catch-all, so we never strand.
 */

import type {
  Flow,
  FlowState,
  Node,
  Branch,
  Option,
  ChatMessage,
} from './flow.types';
import { END } from './flow.types';

// ─────────────────────────────────────────────────────────────────────────────
// 1. ANSWER SHAPES THE UI SENDS BACK
// ─────────────────────────────────────────────────────────────────────────────

/** What the user just did — the only input to {@link advance}. */
export type Answer =
  | {
      kind: 'option';
      /** Must match an Option.id on the current node. */
      optionId: string;
    }
  | {
      kind: 'text';
      /** Verbatim user input. */
      raw: string;
      /**
       * Result of running the InputSlot.extract (if any) on `raw`. The UI/
       * orchestrator runs the LLM call and hands us the extracted value;
       * the engine never makes network calls itself.
       */
      extracted?: unknown;
    };

// ─────────────────────────────────────────────────────────────────────────────
// 2. INIT
// ─────────────────────────────────────────────────────────────────────────────

export interface InitOptions {
  startNodeId?: string;
  /** Initial context (e.g. scraper hits, demo prefill). */
  context?: Record<string, unknown>;
  /** Initial OnboardingData (e.g. prefilled from Google Places). */
  data?: FlowState['data'];
}

export function init(flow: Flow, options: InitOptions = {}): FlowState {
  const startId = options.startNodeId ?? 'start';
  const startNode = flow.get(startId);
  if (!startNode) {
    throw new Error(`engine.init: start node "${startId}" not in flow`);
  }
  return {
    currentNodeId: startId,
    messages: botMessagesFor(startNode, options.context ?? {}),
    data: options.data ?? {},
    context: options.context ?? {},
    done: false,
    lastError: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. ADVANCE
// ─────────────────────────────────────────────────────────────────────────────

export function advance(flow: Flow, state: FlowState, answer: Answer): FlowState {
  if (state.done) return state;
  const node = flow.get(state.currentNodeId);
  if (!node) {
    // Should be unreachable if validateFlow was run, but fail loud rather
    // than silently freeze.
    return { ...state, lastError: `unknown node "${state.currentNodeId}"` };
  }

  // 1. Resolve the value the user actually picked / typed.
  const resolved = resolveAnswer(node, answer);
  if (resolved.kind === 'error') {
    return { ...state, lastError: resolved.message };
  }

  // 2. Validate (only for text input — option clicks are pre-validated).
  if (resolved.kind === 'text' && node.input?.validate) {
    const err = node.input.validate(resolved.raw, resolved.extracted);
    if (err) {
      return {
        ...state,
        // Echo the user's attempt as a transcript line so the error has
        // visible context, but don't advance.
        messages: [
          ...state.messages,
          userMessage(node.id, resolved.raw),
        ],
        lastError: err,
      };
    }
  }

  // 3. Write to OnboardingData if the node declares a target.
  const nextData = writeValue(state.data, node, resolved);

  // 4. Find the next node id via branches.
  const nextId = pickBranch(node.branches, answer, state.context);
  const isEnd = nextId === END;
  const nextNode = isEnd ? null : flow.get(nextId);
  if (!isEnd && !nextNode) {
    return { ...state, lastError: `branch to unknown node "${nextId}"` };
  }

  // 5. Compose the transcript: echo the user, then the next bot turn(s).
  const userText = resolved.kind === 'option' ? resolved.optionLabel : resolved.raw;
  const newMessages: ChatMessage[] = [
    ...state.messages,
    userMessage(node.id, userText),
    ...(nextNode ? botMessagesFor(nextNode, state.context) : []),
  ];

  return {
    currentNodeId: isEnd ? state.currentNodeId : nextId,
    messages: newMessages,
    data: nextData,
    context: state.context,
    done: isEnd,
    lastError: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

type Resolved =
  | { kind: 'option'; optionId: string; optionLabel: string; value: unknown | undefined }
  | { kind: 'text'; raw: string; extracted: unknown | undefined }
  | { kind: 'error'; message: string };

function resolveAnswer(node: Node, answer: Answer): Resolved {
  if (answer.kind === 'option') {
    if (!node.options) {
      return { kind: 'error', message: `node "${node.id}" expects text input, got option` };
    }
    const opt = node.options.find((o: Option) => o.id === answer.optionId);
    if (!opt) {
      return { kind: 'error', message: `option "${answer.optionId}" not on node "${node.id}"` };
    }
    return { kind: 'option', optionId: opt.id, optionLabel: opt.label, value: opt.value };
  }
  if (!node.input) {
    return { kind: 'error', message: `node "${node.id}" expects option click, got text` };
  }
  return { kind: 'text', raw: answer.raw, extracted: answer.extracted };
}

function writeValue(
  data: FlowState['data'],
  node: Node,
  resolved: Resolved,
): FlowState['data'] {
  if (!node.writes) return data;
  if (resolved.kind === 'error') return data;
  // For option clicks, write the option.value (may be undefined for purely
  // navigational options — in which case we skip the write).
  if (resolved.kind === 'option') {
    if (resolved.value === undefined) return data;
    return { ...data, [node.writes]: resolved.value };
  }
  // For text, prefer the extracted structured value if the extractor ran,
  // otherwise the raw string.
  const v = resolved.extracted !== undefined ? resolved.extracted : resolved.raw;
  return { ...data, [node.writes]: v };
}

function pickBranch(
  branches: readonly Branch[],
  answer: Answer,
  context: Readonly<Record<string, unknown>>,
): string {
  for (const b of branches) {
    if (matches(b, answer, context)) return b.next;
  }
  // validateFlow guarantees an `always` catch-all exists; this is a defensive
  // fallback in case validation was skipped.
  return branches[branches.length - 1].next;
}

function matches(
  branch: Branch,
  answer: Answer,
  context: Readonly<Record<string, unknown>>,
): boolean {
  switch (branch.when.kind) {
    case 'always':
      return true;
    case 'option_id':
      return answer.kind === 'option' && answer.optionId === branch.when.equals;
    case 'context':
      return context[branch.when.key] === branch.when.equals;
  }
}

function botMessagesFor(
  node: Node,
  context: Readonly<Record<string, unknown>>,
): readonly ChatMessage[] {
  return node.say.map((s, i) => ({
    id: `${node.id}-bot-${i}`,
    turn: 'bot' as const,
    text: interpolate(s, context),
    nodeId: node.id,
  }));
}

function userMessage(nodeId: string, text: string): ChatMessage {
  // crypto.randomUUID is fine in browser + node 19+; we don't need crypto
  // strength, just uniqueness within the transcript.
  return {
    id: `${nodeId}-user-${Math.random().toString(36).slice(2, 10)}`,
    turn: 'user',
    text,
    nodeId,
  };
}

/**
 * Replaces `{varName}` tokens with `context[varName]` stringified. Unknown
 * keys are left as-is so the placeholder is visible in dev (vs silently
 * blank in prod).
 */
function interpolate(template: string, context: Readonly<Record<string, unknown>>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const v = context[key];
    return v === undefined || v === null ? whole : String(v);
  });
}
