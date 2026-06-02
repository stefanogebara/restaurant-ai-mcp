/**
 * Tiny throwaway flow we can wire to /onboarding-chat in B3 so the route
 * has SOMETHING to render. The real onboarding flow lands in B4.
 *
 * Walks 3 nodes:
 *   1. greet (click "Hi") → goes to ask-name
 *   2. ask-name (text input) → writes restaurant_name, goes to done
 *   3. done (final, click "OK" → END)
 */

import { flowFromNodes } from './validateFlow';
import { END, type Node } from './flow.types';

const nodes: Node[] = [
  {
    id: 'start',
    say: ['Hi! This is the chat-based onboarding (still building).'],
    options: [{ id: 'go', label: "Let's go" }],
    branches: [{ when: { kind: 'always' }, next: 'ask-name' }],
  },
  {
    id: 'ask-name',
    say: ['What is your restaurant called?'],
    input: {
      kind: 'text',
      placeholder: 'e.g. Cantina Bella',
      validate: (raw) => (raw.length >= 2 ? null : 'Name too short'),
    },
    writes: 'restaurant_name',
    branches: [{ when: { kind: 'always' }, next: 'done' }],
  },
  {
    id: 'done',
    say: ['Cool — {restaurant_name}. (real flow lands in B4)'],
    options: [{ id: 'end', label: 'OK' }],
    branches: [{ when: { kind: 'always' }, next: END }],
  },
];

export const mockFlow = flowFromNodes(nodes);
