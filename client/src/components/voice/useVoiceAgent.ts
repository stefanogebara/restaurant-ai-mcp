/**
 * useVoiceAgent — wraps ElevenLabs useConversation with Seatable auth
 *
 * Provides: start/stop, agentState, volume getters, status
 */
import { useConversation } from '@elevenlabs/react';
import { useState, useCallback, useRef, useEffect } from 'react';

export type AgentState = 'idle' | 'ready' | 'connecting' | 'listening' | 'thinking' | 'talking';

interface UseVoiceAgentOptions {
  agentId: string;
  /** If true, fetch signed URL from /api/elevenlabs-signed-url */
  useSignedUrl?: boolean;
  /** If true, show "Ready to call?" confirmation before requesting mic (default: true) */
  requireConfirmation?: boolean;
}

export function useVoiceAgent({ agentId, useSignedUrl = false, requireConfirmation = true }: UseVoiceAgentOptions) {
  const [agentState, setAgentState] = useState<AgentState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<Array<{ role: 'user' | 'agent'; text: string }>>([]);

  // Volume refs for animation frame reads (avoid re-renders)
  const inputVolumeRef = useRef(0);
  const outputVolumeRef = useRef(0);

  const conversation = useConversation({
    onConnect: () => {
      setAgentState('listening');
      setError(null);
    },
    onDisconnect: () => {
      setAgentState('idle');
    },
    onModeChange: ({ mode }: { mode: string }) => {
      setAgentState(mode === 'speaking' ? 'talking' : 'listening');
    },
    onMessage: (message: { message: string; source: 'user' | 'ai' }) => {
      setTranscript((prev) => [
        ...prev,
        { role: message.source === 'ai' ? 'agent' : 'user', text: message.message },
      ]);
    },
    onError: (message: string, context?: unknown) => {
      console.error('Voice agent error:', message, context);
      setError(message || 'Voice connection failed');
      setAgentState('idle');
    },
  });

  // Poll volumes in rAF for smooth animation
  useEffect(() => {
    if (agentState === 'idle' || agentState === 'connecting') return;

    let animId: number;
    const poll = () => {
      inputVolumeRef.current = conversation.getInputVolume?.() ?? 0;
      outputVolumeRef.current = conversation.getOutputVolume?.() ?? 0;
      animId = requestAnimationFrame(poll);
    };
    animId = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(animId);
  }, [agentState, conversation]);

  /** Actually connect to the voice agent (requests mic permission) */
  const connect = useCallback(async () => {
    if (conversation.status === 'connected') return;

    setAgentState('connecting');
    setError(null);
    setTranscript([]);

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });

      if (useSignedUrl) {
        const res = await fetch('/api/elevenlabs-signed-url');
        if (!res.ok) throw new Error('Failed to get signed URL');
        const data = await res.json();
        await conversation.startSession({ signedUrl: data.signed_url } as any);
      } else {
        await conversation.startSession({ agentId, connectionType: 'websocket' } as any);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to start voice agent';
      setError(msg);
      setAgentState('idle');
    }
  }, [conversation, agentId, useSignedUrl]);

  /** Show pre-flight confirmation, or connect directly if confirmation disabled */
  const start = useCallback(async () => {
    if (requireConfirmation) {
      setAgentState('ready');
    } else {
      await connect();
    }
  }, [requireConfirmation, connect]);

  /** Confirm the pre-flight and actually connect */
  const confirmStart = useCallback(async () => {
    await connect();
  }, [connect]);

  /** Dismiss the pre-flight and go back to idle */
  const cancelStart = useCallback(() => {
    setAgentState('idle');
  }, []);

  const stop = useCallback(async () => {
    await conversation.endSession();
    setAgentState('idle');
  }, [conversation]);

  const toggle = useCallback(async () => {
    if (agentState === 'idle') {
      await start();
    } else if (agentState === 'ready') {
      await confirmStart();
    } else {
      await stop();
    }
  }, [agentState, start, confirmStart, stop]);

  return {
    agentState,
    error,
    transcript,
    toggle,
    start,
    stop,
    confirmStart,
    cancelStart,
    isSpeaking: conversation.isSpeaking,
    status: conversation.status,
    getInputVolume: () => inputVolumeRef.current,
    getOutputVolume: () => outputVolumeRef.current,
  };
}
