/**
 * Static validator for {@link Flow} definitions. Run once at module load
 * so a broken flow throws at startup, not in front of a user.
 *
 * Checks:
 *   - every Branch.next is either END or a node that exists in the map
 *   - every node has at least one branch (otherwise the flow dead-ends)
 *   - the last branch in each node is a catch-all `{ kind: 'always' }`,
 *     so we can't accidentally strand the user when no predicate matches
 *   - there are no duplicate node ids (the Map constructor would silently
 *     overwrite — this is a separate explicit check on the input array)
 *   - start node exists
 */

import { type Flow, type Node, END } from './flow.types';

export class FlowValidationError extends Error {
  constructor(message: string) {
    super(`Flow definition invalid: ${message}`);
    this.name = 'FlowValidationError';
  }
}

export function flowFromNodes(nodes: readonly Node[], startNodeId = 'start'): Flow {
  const ids = new Set<string>();
  for (const n of nodes) {
    if (ids.has(n.id)) {
      throw new FlowValidationError(`duplicate node id "${n.id}"`);
    }
    ids.add(n.id);
  }
  const flow: Flow = new Map(nodes.map((n) => [n.id, n]));
  validateFlow(flow, startNodeId);
  return flow;
}

export function validateFlow(flow: Flow, startNodeId = 'start'): void {
  if (!flow.has(startNodeId)) {
    throw new FlowValidationError(`start node "${startNodeId}" not in flow`);
  }
  for (const node of flow.values()) {
    if (node.branches.length === 0) {
      throw new FlowValidationError(`node "${node.id}" has no branches — dead end`);
    }
    const last = node.branches[node.branches.length - 1];
    if (last.when.kind !== 'always') {
      throw new FlowValidationError(
        `node "${node.id}" — last branch must be { kind: 'always' } as the catch-all, got ${JSON.stringify(last.when)}`,
      );
    }
    for (const b of node.branches) {
      if (b.next !== END && !flow.has(b.next)) {
        throw new FlowValidationError(
          `node "${node.id}" branches to unknown node "${b.next}"`,
        );
      }
    }
  }
}
