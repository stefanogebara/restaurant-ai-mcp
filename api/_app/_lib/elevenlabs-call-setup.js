'use strict';

// What every restaurant agent needs for a call to work end to end, shared by
// agent creation (elevenlabsAgentService.createAgent) and the sync that
// brings existing agents up to date (elevenlabs-language-sync).
//
// Found in the first browser test call of the new onboarding (2026-11-16):
// - client_events had no 'audio': ElevenLabs sent the browser her words as
//   text but never her voice, so the owner heard nothing. Phone calls were
//   not affected (ElevenLabs plays phone audio on its side). 'interruption'
//   lets the browser stop her audio when the guest talks over her.
// - no end_call tool: the prompt has said "use the end_call tool" for months,
//   but the tool was never given, so after "tchau" she kept asking
//   "Ainda está aí?" until the guest hung up.

const CLIENT_EVENTS = Object.freeze([
  'audio',
  'interruption',
  'agent_response',
  'agent_response_correction',
  'user_transcript',
  'internal_tentative_agent_response',
]);

// ElevenLabs system tool, same shape as the language_detection tool the
// shared agent scripts use (scripts/repair-shared-voice-language.cjs).
const END_CALL_TOOL = Object.freeze({
  type: 'system',
  name: 'end_call',
  description: '',
  params: Object.freeze({ system_tool_type: 'end_call' }),
});

function hasEndCall(builtInTools) {
  const tool = builtInTools?.end_call;
  return Boolean(tool && (tool.params?.system_tool_type === 'end_call' || tool.name === 'end_call'));
}

/**
 * What an agent's conversation_config lacks for a working call.
 * @returns {{ reasons: string[], clientEvents: string[]|null, builtInTools: object|null }}
 *   clientEvents / builtInTools: the full value to PATCH, or null when already right.
 *   Existing events and built-in tools are kept: the PATCH adds, never removes.
 */
function callSetupGaps(conversationConfig) {
  const current = Array.isArray(conversationConfig?.conversation?.client_events)
    ? conversationConfig.conversation.client_events : [];
  const missing = CLIENT_EVENTS.filter((event) => !current.includes(event));
  const tools = conversationConfig?.agent?.prompt?.built_in_tools || {};
  const endCall = hasEndCall(tools);

  const reasons = [];
  if (missing.length) reasons.push(`call events missing: ${missing.join(', ')}`);
  if (!endCall) reasons.push('end_call tool missing');
  return {
    reasons,
    clientEvents: missing.length ? [...current, ...missing] : null,
    builtInTools: endCall ? null : { ...tools, end_call: { ...END_CALL_TOOL, params: { ...END_CALL_TOOL.params } } },
  };
}

module.exports = { CLIENT_EVENTS, END_CALL_TOOL, callSetupGaps };
