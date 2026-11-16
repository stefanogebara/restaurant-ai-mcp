import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../../common/ThiingsIcon';
import { getSheetCopy } from './sheetCopy';
import { LAUNCH_STEPS, type LaunchStep, type LaunchStepKey, type LaunchSteps } from '../../../lib/onboardingLaunch';

/**
 * The five setup results as one list, shared by the progress screen and the
 * final screen so the rows stay in place when one becomes the other.
 *
 * A row is "done" only when the SERVER said ok. While the setup runs, the
 * first row without an answer is the one in progress; the others wait.
 * Nothing here is timed: a row moves when its event arrives.
 */
type RowState = 'done' | 'attention' | 'working' | 'waiting' | 'unknown';

export interface LaunchStepListProps {
  steps: LaunchSteps;
  /** Final statuses (the endpoint's `setup`); events win when both exist. */
  setup?: Record<string, string> | null;
  phase: 'working' | 'done';
}

export function LaunchStepList({ steps, setup, phase }: LaunchStepListProps) {
  const { i18n } = useTranslation();
  const copy = getSheetCopy(i18n.language);
  const languageNames = useMemo(() => {
    try { return new Intl.DisplayNames([i18n.language || 'en'], { type: 'language' }); } catch { return null; }
  }, [i18n.language]);
  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.language || 'en', { day: 'numeric', month: 'long' }),
    [i18n.language],
  );

  const statusOf = (key: LaunchStepKey) => steps[key]?.status ?? setup?.[key];
  const firstOpen = LAUNCH_STEPS.find((key) => statusOf(key) === undefined);

  function stateOf(key: LaunchStepKey): RowState {
    const status = statusOf(key);
    if (status === 'ok') return 'done';
    if (status === 'unknown') return 'unknown';
    if (status !== undefined) return 'attention';
    if (phase === 'done') return 'unknown';
    return key === firstOpen ? 'working' : 'waiting';
  }

  function detailOf(key: LaunchStepKey, state: RowState, step?: LaunchStep): string {
    if (state === 'working') return copy.stepWorking;
    if (state === 'attention') return copy.needsAttention;
    if (state === 'unknown') return copy.notReported;
    if (state !== 'done' || !step) return state === 'done' ? copy.configured : '';
    if (key === 'restaurant' && typeof step.tables === 'number' && step.tables > 0) {
      return copy.stepTables.replace('{{tables}}', String(step.tables)).replace('{{seats}}', String(step.seats ?? 0));
    }
    if (key === 'voice_agent' && step.language) {
      const name = languageNames?.of(step.language) || step.language;
      return copy.stepLanguage.replace('{{language}}', name.toLocaleLowerCase(i18n.language || 'en'));
    }
    if (key === 'subscription' && step.plan === 'free') return copy.stepFree;
    if (key === 'subscription' && step.plan === 'trial' && step.trial_end) {
      const end = new Date(step.trial_end);
      if (!Number.isNaN(end.getTime())) return copy.stepTrial.replace('{{date}}', dateFormat.format(end));
    }
    return copy.configured;
  }

  return (
    <ol aria-live="polite" className="divide-y divide-glass-border-dark border-y border-glass-border-dark">
      {LAUNCH_STEPS.map((key) => {
        const state = stateOf(key);
        const detail = detailOf(key, state, steps[key]);
        return (
          <li key={key} data-testid={`launch-step-${key}`} data-state={state}
            className="flex items-center gap-4 py-4">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center" aria-hidden="true">
              {state === 'done' && <ThiingsIcon name="check-circle" pxSize={22} className="text-emerald-600 motion-safe:animate-fade-in-up" />}
              {state === 'attention' && <ThiingsIcon name="alert-circle" pxSize={22} className="text-amber-600" />}
              {state === 'unknown' && <ThiingsIcon name="help-circle" pxSize={22} className="text-muted-stone" />}
              {state === 'working' && (
                <span className="h-[18px] w-[18px] rounded-full border-2 border-deep-charcoal/15 border-t-deep-charcoal motion-safe:animate-spin" />
              )}
              {state === 'waiting' && <span className="h-2 w-2 rounded-full bg-muted-stone/40" />}
            </span>
            <span className={`flex-1 text-[15px] ${state === 'waiting' ? 'text-muted-stone' : 'text-deep-charcoal'}`}>
              {copy[key]}
            </span>
            <span className={`text-right text-[14px] ${
              state === 'done' ? 'text-emerald-700' : state === 'attention' ? 'text-amber-700' : 'text-muted-stone'
            }`}>
              {detail}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default LaunchStepList;
