import { describe, it, expect } from 'vitest';
import { flowFromNodes, validateFlow, FlowValidationError } from '../validateFlow';
import { END, type Node } from '../flow.types';

const minimal: Node = {
  id: 'start',
  say: ['Hi'],
  options: [{ id: 'go', label: 'Go' }],
  branches: [{ when: { kind: 'always' }, next: END }],
};

describe('flowFromNodes', () => {
  it('builds a Flow from a single-node array', () => {
    const flow = flowFromNodes([minimal]);
    expect(flow.size).toBe(1);
    expect(flow.get('start')).toBe(minimal);
  });

  it('rejects duplicate node ids', () => {
    expect(() => flowFromNodes([minimal, { ...minimal }]))
      .toThrow(FlowValidationError);
    expect(() => flowFromNodes([minimal, { ...minimal }]))
      .toThrow(/duplicate node id "start"/);
  });

  it('rejects a flow without the named start node', () => {
    expect(() => flowFromNodes([{ ...minimal, id: 'other' }]))
      .toThrow(/start node "start" not in flow/);
  });

  it('accepts an alternate startNodeId when provided', () => {
    const flow = flowFromNodes([{ ...minimal, id: 'welcome' }], 'welcome');
    expect(flow.get('welcome')).toBeTruthy();
  });
});

describe('validateFlow', () => {
  it('rejects a node with zero branches (dead end)', () => {
    const bad: Node = { ...minimal, branches: [] };
    expect(() => flowFromNodes([bad])).toThrow(/no branches.*dead end/);
  });

  it('rejects a flow whose last branch is not the catch-all', () => {
    const bad: Node = {
      ...minimal,
      branches: [{ when: { kind: 'option_id', equals: 'go' }, next: END }],
    };
    expect(() => flowFromNodes([bad])).toThrow(/last branch must be \{ kind: 'always' \}/);
  });

  it('rejects a branch targeting an unknown node', () => {
    const bad: Node = {
      ...minimal,
      branches: [{ when: { kind: 'always' }, next: 'nowhere' }],
    };
    expect(() => flowFromNodes([bad])).toThrow(/branches to unknown node "nowhere"/);
  });

  it('accepts the END sentinel as a valid branch target', () => {
    expect(() => flowFromNodes([minimal])).not.toThrow();
  });

  it('accepts a multi-node flow where branches reference each other', () => {
    const nodes: Node[] = [
      {
        id: 'start',
        say: ['Welcome'],
        options: [{ id: 'next', label: 'Next' }],
        branches: [
          { when: { kind: 'option_id', equals: 'next' }, next: 'b' },
          { when: { kind: 'always' }, next: END },
        ],
      },
      {
        id: 'b',
        say: ['Step 2'],
        branches: [{ when: { kind: 'always' }, next: END }],
      },
    ];
    expect(() => flowFromNodes(nodes)).not.toThrow();
  });
});
