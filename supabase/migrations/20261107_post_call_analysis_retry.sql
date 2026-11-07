-- A completed transcript and its optional LLM analysis have different lifecycles.
-- Keep the ingestion marker even if analysis times out, and bound retries.
ALTER TABLE public.agent_conversations
  ADD COLUMN IF NOT EXISTS post_call_analysis_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS post_call_analysis_next_at timestamptz,
  ADD COLUMN IF NOT EXISTS post_call_analysis_done_at timestamptz;

CREATE INDEX IF NOT EXISTS agent_conversations_analysis_retry_idx
  ON public.agent_conversations (post_call_analysis_next_at, elevenlabs_fetched_at)
  WHERE elevenlabs_fetched_at IS NOT NULL
    AND customer_sentiment IS NULL
    AND post_call_analysis_done_at IS NULL
    AND post_call_analysis_attempts < 3;
