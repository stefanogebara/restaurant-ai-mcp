/**
 * React hook wrapping the pure engine in {@link engine.ts}. The UI uses
 * useChatFlow(flow) and gets back the current {@link FlowState} + stable
 * dispatch fns for sending user answers.
 *
 * This is the ONLY place the engine touches React. The hook also owns the
 * one piece of side effect the engine refuses to do: calling the LLM
 * extractor in {@link extractors.ts} when the current node's InputSlot has
 * an `extract` key. The result is then fed into the pure engine as
 * `Answer.extracted`.
 */

import { useReducer, useCallback, useMemo, useState } from 'react';
import type { Flow, FlowState } from './flow.types';
import { init, advance, type Answer, type InitOptions } from './engine';
import { extractInput } from './extractors';

interface ReducerAction {
  type: 'advance';
  answer: Answer;
}

export interface UseChatFlowResult {
  state: FlowState;
  pick: (optionId: string) => void;
  /**
   * Send a free-text answer. If the current node's input slot declares an
   * `extract` kind, the hook runs the LLM extraction first and feeds the
   * structured value into the engine alongside the raw string. While the
   * extract is in flight `extracting` is true so the UI can show a spinner.
   */
  send: (raw: string) => Promise<void>;
  extracting: boolean;
  extractError: string | null;
}

export function useChatFlow(flow: Flow, options: InitOptions = {}): UseChatFlowResult {
  const initialState = useMemo<FlowState>(
    () => init(flow, options),
    // We intentionally don't depend on `options` — re-running init mid-flow
    // would blow away the user's progress. The init args are captured once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flow],
  );

  const reducer = useCallback(
    (state: FlowState, action: ReducerAction): FlowState =>
      action.type === 'advance' ? advance(flow, state, action.answer) : state,
    [flow],
  );

  const [state, dispatch] = useReducer(reducer, initialState);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  const pick = useCallback((optionId: string) => {
    setExtractError(null);
    dispatch({ type: 'advance', answer: { kind: 'option', optionId } });
  }, []);

  const send = useCallback(
    async (raw: string) => {
      setExtractError(null);
      const currentNode = flow.get(state.currentNodeId);
      const extractKind = currentNode?.input?.extract;

      // No extractor on this slot — fast path, just dispatch the raw.
      if (!extractKind) {
        dispatch({ type: 'advance', answer: { kind: 'text', raw } });
        return;
      }

      setExtracting(true);
      try {
        const result = await extractInput(extractKind, raw);
        if (!result.ok) {
          setExtractError(result.error);
          // If the failure is non-recoverable, do nothing — the user retries.
          // If it's recoverable, still dispatch the raw so the engine's
          // validate() gets a shot at the unstructured input as a fallback.
          if (result.fallbackToStructured) {
            dispatch({ type: 'advance', answer: { kind: 'text', raw } });
          }
          return;
        }
        dispatch({ type: 'advance', answer: { kind: 'text', raw, extracted: result.value } });
      } finally {
        setExtracting(false);
      }
    },
    [flow, state.currentNodeId],
  );

  return { state, pick, send, extracting, extractError };
}
