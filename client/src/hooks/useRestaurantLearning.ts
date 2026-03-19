/**
 * useRestaurantLearning Hook
 *
 * Manages the 3-phase restaurant learning flow:
 * 1. Research - AI researches the restaurant online
 * 2. Interview - Chat-based interview to fill knowledge gaps
 * 3. Persona - Generate and preview AI persona
 */

import { useState, useCallback, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { authFetch } from '../services/api';
import type {
  LearningPhase,
  ResearchResult,
  InterviewMessage,
  PersonaPreview,
  ChatResponse,
} from '../types/restaurant-learning.types';

interface UseRestaurantLearningReturn {
  phase: LearningPhase;
  isLoading: boolean;
  error: string | null;
  researchResult: ResearchResult | null;
  messages: InterviewMessage[];
  persona: PersonaPreview | null;
  topicsCovered: string[];
  sessionId: string | null;
  shouldGeneratePersona: boolean;
  startResearch: (restaurantName: string, city: string, country: string, website?: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  generatePersona: () => Promise<void>;
  setPhase: (phase: LearningPhase) => void;
  restart: () => void;
}

const TOTAL_TOPICS = 8;

function createMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useRestaurantLearning(): UseRestaurantLearningReturn {
  const [phase, setPhase] = useState<LearningPhase>('research');
  const [error, setError] = useState<string | null>(null);
  const [researchResult, setResearchResult] = useState<ResearchResult | null>(null);
  const [messages, setMessages] = useState<InterviewMessage[]>([]);
  const [persona, setPersona] = useState<PersonaPreview | null>(null);
  const [topicsCovered, setTopicsCovered] = useState<string[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [shouldGeneratePersona, setShouldGeneratePersona] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const researchMutation = useMutation({
    mutationFn: async ({
      restaurantName, city, country, website,
    }: { restaurantName: string; city: string; country: string; website?: string }) => {
      abortControllerRef.current = new AbortController();
      const response = await authFetch('/api/restaurant-learning/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurant_name: restaurantName,
          city,
          country,
          website: website || undefined,
        }),
        signal: abortControllerRef.current.signal,
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to research restaurant');
      }
      return response.json();
    },
    onMutate: () => { setError(null); setPhase('research'); },
    onSuccess: (data, { restaurantName }) => {
      setResearchResult(data.research_results ?? null);
      setSessionId(data.session_id ?? null);
      const initialMessage: InterviewMessage = {
        id: createMessageId(),
        role: 'assistant',
        content: data.initial_ai_message || `Great! I found some information about ${restaurantName}. Let me ask you a few questions to understand your restaurant better.`,
        timestamp: Date.now(),
        quick_replies: data.quick_replies ?? [],
      };
      setMessages([initialMessage]);
      if (data.topics_covered) setTopicsCovered(data.topics_covered);
      setPhase('interview');
    },
    onError: (err: unknown) => {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Research failed');
    },
  });

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      abortControllerRef.current = new AbortController();
      const response = await authFetch('/api/restaurant-learning/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, message: content }),
        signal: abortControllerRef.current.signal,
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to send message');
      }
      return response.json() as Promise<ChatResponse>;
    },
    onMutate: (content) => {
      const userMessage: InterviewMessage = {
        id: createMessageId(),
        role: 'user',
        content,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, userMessage]);
      setError(null);
    },
    onSuccess: (data) => {
      const aiMessage: InterviewMessage = {
        id: createMessageId(),
        role: 'assistant',
        content: data.ai_message,
        timestamp: Date.now(),
        quick_replies: data.quick_replies ?? [],
      };
      setMessages(prev => [...prev, aiMessage]);
      if (data.topics_covered) setTopicsCovered(data.topics_covered);
      if (data.is_complete) setShouldGeneratePersona(true);
    },
    onError: (err: unknown) => {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to send message');
    },
  });

  const personaMutation = useMutation({
    mutationFn: async () => {
      abortControllerRef.current = new AbortController();
      const response = await authFetch('/api/restaurant-learning/generate-persona', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
        signal: abortControllerRef.current.signal,
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to generate persona');
      }
      return response.json();
    },
    onMutate: () => { setShouldGeneratePersona(false); setError(null); },
    onSuccess: (data) => {
      setPersona({
        persona_summary: data.persona_summary ?? '',
        restaurant_profile: data.restaurant_profile ?? {},
        greeting_preview: data.greeting_preview ?? '',
      });
      setPhase('persona');
    },
    onError: (err: unknown) => {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to generate persona');
    },
  });

  const isLoading = researchMutation.isPending || sendMutation.isPending || personaMutation.isPending;

  const startResearch = useCallback(
    (restaurantName: string, city: string, country: string, website?: string) =>
      researchMutation.mutateAsync({ restaurantName, city, country, website }),
    [researchMutation]
  );

  const sendMessage = useCallback(
    (content: string): Promise<void> => {
      if (!content.trim() || isLoading) return Promise.resolve();
      return sendMutation.mutateAsync(content.trim()).then(() => {});
    },
    [sendMutation, isLoading]
  );

  const generatePersona = useCallback(
    () => personaMutation.mutateAsync(undefined),
    [personaMutation]
  );

  const restart = useCallback(() => {
    abortControllerRef.current?.abort();
    researchMutation.reset();
    sendMutation.reset();
    personaMutation.reset();
    setPhase('research');
    setError(null);
    setResearchResult(null);
    setMessages([]);
    setPersona(null);
    setTopicsCovered([]);
    setSessionId(null);
    setShouldGeneratePersona(false);
  }, [researchMutation, sendMutation, personaMutation]);

  return {
    phase,
    isLoading,
    error,
    researchResult,
    messages,
    persona,
    topicsCovered,
    sessionId,
    shouldGeneratePersona,
    startResearch,
    sendMessage,
    generatePersona,
    setPhase,
    restart,
  };
}

export { TOTAL_TOPICS };
