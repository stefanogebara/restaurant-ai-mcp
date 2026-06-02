/**
 * Chat-based onboarding (Phase B). New route /onboarding-chat — does NOT
 * replace /onboarding (the form wizard) yet. Both coexist until the chat
 * is signal-tested in production (B5+).
 *
 * On END the page POSTs the accumulated FlowState.data to the existing
 * /api/onboarding/complete endpoint so the chat lands in the same place
 * as the form. The endpoint is unchanged — this is intentional, since the
 * server's validation/restaurant-creation logic is the source of truth.
 */
import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import ChatThread from '../components/onboarding-chat/ChatThread';
import ChatComposer from '../components/onboarding-chat/ChatComposer';
import { useChatFlow } from '../lib/onboarding-chat/useChatFlow';
import { onboardingFlow } from '../lib/onboarding-chat/flow';
import { useAuth } from '../contexts/AuthContext';
import { authFetch } from '../services/api';
import { LS_CUSTOMER_EMAIL } from '../config/localStorageKeys';

export default function OnboardingChat() {
  useDocumentTitle('Onboarding (chat)');
  const navigate = useNavigate();
  const { user } = useAuth();

  // Pre-fill customer_email from auth so the API has a contact even if
  // the chat doesn't ask explicitly. The form does the same in its
  // buildDefaultData() — we mirror it.
  const customerEmail = user?.email || localStorage.getItem(LS_CUSTOMER_EMAIL) || '';

  const flow = onboardingFlow;
  const { state, pick, send } = useChatFlow(flow, {
    data: { customer_email: customerEmail, restaurant_id: '', plan: 'Starter' },
  });

  const currentNode = useMemo(
    () => (state.done ? null : flow.get(state.currentNodeId) ?? null),
    [flow, state.currentNodeId, state.done],
  );

  // Submit-on-END state machine. Idempotent: only fires once per `done`
  // transition, even if React re-renders the page.
  const [submitState, setSubmitState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!state.done || submitState !== 'idle') return;
    let cancelled = false;
    (async () => {
      setSubmitState('submitting');
      try {
        const res = await authFetch('/api/onboarding/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(state.data),
        });
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setSubmitError(body?.error || `Server returned ${res.status}`);
          setSubmitState('error');
          return;
        }
        setSubmitState('success');
        // Mirror the form's post-submit nav so analytics + onboarding-completed
        // tracking land in the same place. Small delay so the success bubble
        // is visible.
        setTimeout(() => navigate('/host-dashboard'), 1500);
      } catch (e: unknown) {
        if (cancelled) return;
        setSubmitError(e instanceof Error ? e.message : 'Network error');
        setSubmitState('error');
      }
    })();
    return () => { cancelled = true; };
  }, [state.done, state.data, submitState, navigate]);

  return (
    <div className="min-h-screen bg-warm-white flex flex-col" data-testid="onboarding-chat-page">
      <header className="border-b border-border-gray bg-white px-4 py-3">
        <p className="text-sm font-medium text-deep-charcoal">Seatable onboarding</p>
        <p className="text-xs text-muted-stone">Chat with us to get set up — won't take long.</p>
      </header>

      <main className="flex-1 flex flex-col max-w-2xl w-full mx-auto">
        <ChatThread messages={state.messages} />

        {state.done ? (
          <div className="border-t border-border-gray bg-warm-white px-4 py-6 text-center space-y-2" data-testid="onboarding-chat-done">
            {submitState === 'submitting' && (
              <p className="text-sm text-muted-stone">Creating your restaurant…</p>
            )}
            {submitState === 'success' && (
              <p className="text-sm text-emerald-700">All set — opening your dashboard.</p>
            )}
            {submitState === 'error' && (
              <>
                <p className="text-sm text-red-700" data-testid="onboarding-chat-error">{submitError}</p>
                <button
                  type="button"
                  onClick={() => { setSubmitState('idle'); setSubmitError(null); }}
                  className="text-xs text-burgundy underline underline-offset-2"
                >
                  Try again
                </button>
              </>
            )}
          </div>
        ) : (
          <ChatComposer
            node={currentNode}
            onPick={pick}
            onSend={send}
            lastError={state.lastError}
            disabled={false}
          />
        )}
      </main>
    </div>
  );
}
