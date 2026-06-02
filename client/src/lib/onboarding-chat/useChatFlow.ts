/**
 * React hook wrapping the pure engine in {@link engine.ts}. The UI uses
 * useChatFlow(flow) and gets back the current {@link FlowState} + a stable
 * dispatch fn for sending user answers.
 *
 * This is the ONLY place the engine touches React. Everything below it
 * (engine, flow.types, validateFlow, flow definitions) is pure.
 */

import { useReducer, useCallback, useMemo } from 'react';
import type { Flow, FlowState } from './flow.types';
import { init, advance, type Answer, type InitOptions } from './engine';

interface ReducerAction {
  type: 'advance';
  answer: Answer;
}

export function useChatFlow(flow: Flow, options: InitOptions = {}) {
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

  const pick = useCallback((optionId: string) => {
    dispatch({ type: 'advance', answer: { kind: 'option', optionId } });
  }, []);

  const send = useCallback((raw: string, extracted?: unknown) => {
    dispatch({ type: 'advance', answer: { kind: 'text', raw, extracted } });
  }, []);

  return { state, pick, send };
}
