import type { ToolUsed } from './callTrackingTypes';

function structurallyEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a).sort();
  const otherKeys = Object.keys(b).sort();
  return keys.length === otherKeys.length && keys.every((key, i) => key === otherKeys[i] &&
    structurallyEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

function hasParameters(tool: ToolUsed): tool is ToolUsed & { parameters: Record<string, unknown> } {
  return tool.parameters !== null && typeof tool.parameters === 'object' && !Array.isArray(tool.parameters);
}

function sameInvocation(a: ToolUsed, b: ToolUsed): boolean {
  if (a.tool_name !== b.tool_name || !hasParameters(a) || !hasParameters(b)) return false;
  if (structurallyEqual(a.parameters, b.parameters)) return true;

  // Historical creation failures can omit the top-level restaurant-name decoration.
  // Two explicit names must still agree; every other parameter stays exact.
  const aHasName = Object.prototype.hasOwnProperty.call(a.parameters, 'restaurant_name');
  const bHasName = Object.prototype.hasOwnProperty.call(b.parameters, 'restaurant_name');
  if (aHasName === bHasName) return false;
  const { restaurant_name, ...parameters } = aHasName ? a.parameters : b.parameters;
  return typeof restaurant_name === 'string' && restaurant_name.trim() !== '' &&
    structurallyEqual(parameters, aHasName ? b.parameters : a.parameters);
}

/** Presentation only: retain raw tool evidence and every actual terminal record. */
export function normalizeCallToolActivities(tools: readonly ToolUsed[]): ToolUsed[] {
  const activities: ToolUsed[] = [];
  const unresolved: ToolUsed[] = [];
  for (let i = 0; i < tools.length; i++) {
    const tool = tools[i];
    // This webhook writes a null start followed by its boolean result for create.
    // Null availability results are genuinely unknown, not lifecycle markers.
    if (tool.tool_name === 'create_reservation' && hasParameters(tool)) {
      if (tool.success === null) {
        const next = tools[i + 1];
        if (next && typeof next.success === 'boolean' && sameInvocation(tool, next) &&
            !unresolved.some(start => sameInvocation(start, next))) {
          activities.push(next);
          i++;
          continue;
        }
        unresolved.push(tool);
      } else if (typeof tool.success === 'boolean') {
        const pending = unresolved.filter(start => sameInvocation(start, tool));
        // Consume identical pending markers by count, but never choose between
        // different parameter sets that an omitted name makes ambiguous.
        if (pending.length > 0 && pending.every(start => structurallyEqual(start.parameters, pending[0].parameters))) {
          unresolved.splice(unresolved.indexOf(pending[0]), 1);
        }
      }
    }
    activities.push(tool);
  }
  return activities;
}
