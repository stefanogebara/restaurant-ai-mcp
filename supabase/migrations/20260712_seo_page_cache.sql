-- seo_page_cache — HTML gerado-uma-vez das páginas SEO server-rendered
-- (api/seo/city-cuisine, api/seo/reservas; aquecido por cron/warm-seo-cache).
-- O código referencia esta tabela desde a fase city-cuisine, mas a migration
-- nunca foi aplicada: todo upsert falhava silencioso (tratado como
-- non-critical) e todo lookup dava miss — cada hit fora do edge cache
-- regenerava a página inteira, e o warm cron "aquecia" sem persistir nada.
-- Acesso exclusivamente via supabaseAdmin (service role): RLS habilitado sem
-- policies mantém anon/authenticated fora, no padrão das tabelas prospect_*.
CREATE TABLE IF NOT EXISTS public.seo_page_cache (
  cache_key  TEXT PRIMARY KEY,
  html       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.seo_page_cache ENABLE ROW LEVEL SECURITY;
