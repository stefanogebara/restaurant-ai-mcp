-- Call transcripts and caller numbers are read through authenticated API
-- endpoints using the service role. Direct PostgREST access has no tenant gate.
BEGIN;

DROP POLICY IF EXISTS authenticated_read_conversations ON public.agent_conversations;
DROP POLICY IF EXISTS "Allow authenticated read access" ON public.agent_conversations;
REVOKE ALL ON public.agent_conversations FROM anon, authenticated;
ALTER TABLE public.agent_conversations ENABLE ROW LEVEL SECURITY;

COMMIT;
