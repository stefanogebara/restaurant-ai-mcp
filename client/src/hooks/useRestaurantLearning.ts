/**
 * useRestaurantLearning Hook
 *
 * Manages the 3-phase restaurant learning flow:
 * 1. Research - AI researches the restaurant online
 * 2. Interview - Chat-based interview to fill knowledge gaps
 * 3. Persona - Generate and preview AI persona
 */

import { useState, useCallback, useRef } from 'react';
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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [researchResult, setResearchResult] = useState<ResearchResult | null>(null);
  const [messages, setMessages] = useState<InterviewMessage[]>([]);
  const [persona, setPersona] = useState<PersonaPreview | null>(null);
  const [topicsCovered, setTopicsCovered] = useState<string[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [shouldGeneratePersona, setShouldGeneratePersona] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const startResearch = useCallback(async (
    restaurantName: string,
    city: string,
    country: string,
    website?: string
  ) => {
    setIsLoading(true);
    setError(null);
    setPhase('research');

    try {
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

      const data = await response.json();
      setResearchResult(data.research_results || null);
      setSessionId(data.session_id || null);

      // Transition to interview phase with initial AI message
      const initialMessage: InterviewMessage = {
        id: createMessageId(),
        role: 'assistant',
        content: data.initial_ai_message || `Great! I found some information about ${restaurantName}. Let me ask you a few questions to understand your restaurant better.`,
        timestamp: Date.now(),
        quick_replies: data.quick_replies || [],
      };

      setMessages([initialMessage]);
      if (data.topics_covered) {
        setTopicsCovered(data.topics_covered);
      }
      setPhase('interview');
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setError(err.message || 'Research failed');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMessage: InterviewMessage = {
      id: createMessageId(),
      role: 'user',
      content: content.trim(),
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setError(null);

    try {
      abortControllerRef.current = new AbortController();

      const response = await authFetch('/api/restaurant-learning/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          message: content.trim(),
          messages_history: messages.map(m => ({ role: m.role, content: m.content })),
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to send message');
      }

      const data: ChatResponse = await response.json();

      const aiMessage: InterviewMessage = {
        id: createMessageId(),
        role: 'assistant',
        content: data.ai_message,
        timestamp: Date.now(),
        quick_replies: data.quick_replies || [],
      };

      setMessages(prev => [...prev, aiMessage]);

      if (data.topics_covered) {
        setTopicsCovered(data.topics_covered);
      }

      // Signal the component to trigger generatePersona after state settles
      if (data.is_complete) {
        setShouldGeneratePersona(true);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setError(err.message || 'Failed to send message');
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, messages, isLoading]);

  const generatePersona = useCallback(async () => {
    setShouldGeneratePersona(false);
    setIsLoading(true);
    setError(null);

    try {
      abortControllerRef.current = new AbortController();

      const response = await authFetch('/api/restaurant-learning/generate-persona', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          messages_history: messages.map(m => ({ role: m.role, content: m.content })),
          research: researchResult,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to generate persona');
      }

      const data = await response.json();
      setPersona({
        persona_summary: data.persona_summary || '',
        restaurant_profile: data.restaurant_profile || {},
        greeting_preview: data.greeting_preview || '',
      });
      setPhase('persona');
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setError(err.message || 'Failed to generate persona');
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, messages, researchResult]);

  const restart = useCallback(() => {
    abortControllerRef.current?.abort();
    setPhase('research');
    setIsLoading(false);
    setError(null);
    setResearchResult(null);
    setMessages([]);
    setPersona(null);
    setTopicsCovered([]);
    setSessionId(null);
    setShouldGeneratePersona(false);
  }, []);

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
