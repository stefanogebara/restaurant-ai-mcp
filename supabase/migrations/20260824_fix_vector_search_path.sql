-- 20260824_fix_vector_search_path.sql
-- =============================================================================
-- CONSERTA a busca vetorial quebrada pelo hardening de search_path.
--
-- SINTOMA, medido em produção em 24/08/2026:
--   match_manager_memories  -> operator does not exist: public.vector <=> public.vector
--   retrieve_guest_memories -> relation "guest_memories" does not exist
--
-- CAUSA. A migração 20260521_phase_w4_w5_function_hardening pôs
-- `SET search_path TO ''` nestas funções. Isso está CERTO — search_path vazio é
-- o que impede sequestro de resolução de nome numa função. O que faltou foi a
-- outra metade do trabalho: com o caminho vazio, TUDO precisa ser qualificado, e
-- só as tabelas foram (e nem todas).
--
-- O operador `<=>` do pgvector mora em `public` junto com a extensão. Sem
-- `public` no caminho, o Postgres não o encontra — e o erro não fala em
-- search_path, fala em "operator does not exist", que soa como extensão
-- faltando. A extensão está lá: vector 0.8.0. É resolução de nome, não instalação.
--
-- IMPACTO REAL. `guest_memories` tem 1313 embeddings gravados que nenhuma
-- consulta conseguia ler. A memória do Manager AI e a memória de convidado
-- respondiam sem lembrar de nada, sem erro visível para o usuário final —
-- apenas um catch no serviço e um log.
--
-- CONSERTO. Qualificar o que faltou: `OPERATOR(public.<=>)` para o operador e
-- `public.guest_memories` para a tabela. O search_path vazio FICA — a proteção
-- é boa, o que estava errado era o corpo depender dela.
--
-- Sem mudança de assinatura, de retorno ou de semântica: mesma ordenação, mesmos
-- pesos, mesmos filtros. É CREATE OR REPLACE, então não há janela sem função.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.match_manager_memories(
  p_restaurant_id uuid,
  p_embedding vector,
  p_limit integer DEFAULT 10
)
RETURNS TABLE(id uuid, type text, category text, content text, source text,
              importance integer, similarity double precision)
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  SELECT
    id, type, category, content, source, importance,
    1 - (embedding OPERATOR(public.<=>) p_embedding) AS similarity
  FROM public.manager_memory
  WHERE restaurant_id = p_restaurant_id
    AND embedding IS NOT NULL
  ORDER BY
    (1 - (embedding OPERATOR(public.<=>) p_embedding)) * 0.7 +
    (importance::float / 10.0) * 0.3
  DESC
  LIMIT p_limit;
$function$;

CREATE OR REPLACE FUNCTION public.retrieve_guest_memories(
  p_restaurant_id uuid,
  p_guest_phone text,
  p_query_embedding vector,
  p_limit integer DEFAULT 10,
  p_alpha_recency double precision DEFAULT 0.3,
  p_alpha_importance double precision DEFAULT 0.3,
  p_alpha_relevance double precision DEFAULT 0.4
)
RETURNS TABLE(id uuid, memory_type text, content text, importance smallint,
              created_at timestamp with time zone, score double precision)
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  RETURN QUERY
    SELECT
      gm.id,
      gm.memory_type,
      gm.content,
      gm.importance,
      gm.created_at,
      (
        p_alpha_recency * (1.0 / (1.0 + EXTRACT(EPOCH FROM (now() - gm.created_at)) / 86400.0)) +
        p_alpha_importance * (gm.importance::float / 10.0) +
        p_alpha_relevance * (1.0 - (gm.embedding OPERATOR(public.<=>) p_query_embedding))
      )::FLOAT AS score
    FROM public.guest_memories gm
    WHERE gm.restaurant_id = p_restaurant_id
      AND gm.guest_phone = p_guest_phone
      AND gm.is_active = true
      AND gm.embedding IS NOT NULL
    ORDER BY score DESC
    LIMIT p_limit;
END;
$function$;
