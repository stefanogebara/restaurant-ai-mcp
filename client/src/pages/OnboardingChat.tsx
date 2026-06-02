/**
 * Chat-based onboarding (Phase B). New route /onboarding-chat — does NOT
 * replace /onboarding (the form wizard) yet. Both will coexist until the
 * chat flow is complete enough to take over (B4).
 *
 * Currently mounted with mockFlow (3 nodes). Real flow lands in B4.
 */
import { useMemo } from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import ChatThread from '../components/onboarding-chat/ChatThread';
import ChatComposer from '../components/onboarding-chat/ChatComposer';
import { useChatFlow } from '../lib/onboarding-chat/useChatFlow';
import { mockFlow } from '../lib/onboarding-chat/mockFlow';

export default function OnboardingChat() {
  useDocumentTitle('Onboarding (chat)');

  const flow = mockFlow;
  const { state, pick, send } = useChatFlow(flow);

  const currentNode = useMemo(
    () => (state.done ? null : flow.get(state.currentNodeId) ?? null),
    [flow, state.currentNodeId, state.done],
  );

  return (
    <div className="min-h-screen bg-warm-white flex flex-col" data-testid="onboarding-chat-page">
      <header className="border-b border-border-gray bg-white px-4 py-3">
        <p className="text-sm font-medium text-deep-charcoal">Seatable onboarding</p>
        <p className="text-xs text-muted-stone">Chat with us to get set up — won't take long.</p>
      </header>

      <main className="flex-1 flex flex-col max-w-2xl w-full mx-auto">
        <ChatThread messages={state.messages} />
        {state.done ? (
          <div className="border-t border-border-gray bg-warm-white px-4 py-6 text-center" data-testid="onboarding-chat-done">
            <p className="text-sm text-muted-stone">All set — backend wiring lands in B4.</p>
          </div>
        ) : (
          <ChatComposer
            node={currentNode}
            onPick={pick}
            onSend={send}
            lastError={state.lastError}
          />
        )}
      </main>
    </div>
  );
}
