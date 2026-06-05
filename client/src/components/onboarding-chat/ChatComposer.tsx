/**
 * The bottom bar of the chat. Renders BOTH the click-options for the
 * current node AND a text input â€” they coexist so the user can pick a
 * button OR type a custom answer for nodes that allow both.
 *
 * Pure presentational. The parent owns the current Node and wires onPick /
 * onSend to the engine.
 */
import { useState, type FormEvent } from 'react';
import type { Node } from '../../lib/onboarding-chat/flow.types';

export interface ChatComposerProps {
  node: Node | null;
  onPick: (optionId: string) => void;
  onSend: (raw: string) => void;
  /** Error from the last failed validation, surfaced above the input. */
  lastError: string | null;
  disabled?: boolean;
}

export default function ChatComposer({ node, onPick, onSend, lastError, disabled }: ChatComposerProps) {
  const [draft, setDraft] = useState('');

  if (!node) return null;
  const showOptions = (node.options?.length ?? 0) > 0;
  const showInput = !!node.input;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setDraft('');
  };

  return (
    <div className="border-t border-glass-border-dark bg-warm-white" data-testid="chat-composer">
      {lastError && (
        <div className="px-4 pt-3" data-testid="chat-composer-error">
          <p className="text-sm text-red-700">{lastError}</p>
        </div>
      )}

      {showOptions && (
        <div className="px-4 pt-3 flex flex-wrap gap-2" data-testid="chat-composer-options">
          {node.options!.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onPick(opt.id)}
              disabled={disabled}
              className="px-4 py-2 bg-white/60 backdrop-blur-glass-chip border border-glass-border-dark rounded-full text-sm text-deep-charcoal hover:bg-burgundy hover:text-white hover:border-burgundy transition-colors disabled:opacity-50"
              data-testid={`chat-composer-option-${opt.id}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {showInput && (
        <form onSubmit={handleSubmit} className="px-4 py-3 flex items-end gap-2">
          <input
            type={inputTypeFor(node.input!.kind)}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={node.input!.placeholder || 'Type your answerâ€¦'}
            disabled={disabled}
            className="flex-1 px-4 py-2.5 glass-panel rounded-xl text-sm text-deep-charcoal placeholder:text-muted-stone focus:outline-none focus:border-burgundy disabled:opacity-50"
            data-testid="chat-composer-input"
            autoFocus
          />
          <button
            type="submit"
            disabled={disabled || !draft.trim()}
            className="px-4 py-2.5 bg-burgundy text-white rounded-xl text-sm font-medium hover:bg-burgundy-dark transition-colors disabled:opacity-50"
            data-testid="chat-composer-send"
          >
            Send
          </button>
        </form>
      )}
    </div>
  );
}

function inputTypeFor(kind: NonNullable<Node['input']>['kind']): string {
  switch (kind) {
    case 'phone':  return 'tel';
    case 'email':  return 'email';
    case 'url':    return 'url';
    case 'number': return 'number';
    default:       return 'text';
  }
}
