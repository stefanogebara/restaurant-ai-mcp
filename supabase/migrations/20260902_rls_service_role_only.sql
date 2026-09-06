-- Fecha as nove tabelas apontadas pelo advisor de segurança do Supabase.
-- APLICADA EM PRODUÇÃO (seatable-eu) em 2026-09-02; versionada aqui depois.
--
-- O ALERTA SUPERESTIMAVA, e a distinção é o que tornou o conserto seguro:
-- RLS desligado só é exposição se o papel tiver PRIVILÉGIO na tabela. Cinco das
-- nove não tinham grant nenhum para anon nem authenticated. As de fato abertas
-- eram quatro:
--
--   public.ai_spend                       anon + authenticated, TUDO (inclui TRUNCATE)
--   public.ai_provider_fallbacks          idem
--   public.stripe_deposit_routing_events  idem
--   restaurant.stripe_connect_accounts    authenticated, SELECT
--
-- As três primeiras não eram vazamento, eram ADULTERAÇÃO: a chave anon vai no
-- bundle do frontend, e com ela dava para apagar ou forjar o livro de custo real
-- de LLM (1368 linhas vindas de cost_details do OpenRouter), que é o que
-- alimenta o MotorStrip.
--
-- A quarta é a mais séria pelo que revela: qualquer usuário LOGADO lia a linha
-- de Connect de TODOS os 65 restaurantes — stripe_account_id, payouts_enabled,
-- requirements_past_due. Cruzamento de inquilino em dado financeiro. E era
-- alcançável de verdade: o schema `restaurant` está exposto via PostgREST, como
-- prova client/src/pages/Welcome.tsx:61, que o consulta direto do navegador.
--
-- POLÍTICA NENHUMA É A POLÍTICA CERTA, e isso não é preguiça. Os 18 arquivos que
-- tocam essas tabelas usam supabaseAdmin (service role, que passa por cima de
-- RLS por definição) e nenhuma delas é lida pelo frontend. O repo já tem esse
-- padrão com nome: cron_config, restaurant_registry e
-- stripe_webhook_events_processed estão com RLS ligado e ZERO políticas,
-- comentadas como "Service-role-only via RLS", e funcionam há meses.
--
-- O aviso genérico do Supabase — "ligar RLS sem política bloqueia todo acesso" —
-- não vale aqui, porque não existe nada além do service role para bloquear.
--
-- O REVOKE é o que fecha a porta. O ENABLE RLS é a rede embaixo, para o caso de
-- alguém reconceder o grant por descuido depois.

-- 1. As quatro que estavam de fato expostas.
REVOKE ALL ON public.ai_spend                      FROM anon, authenticated;
REVOKE ALL ON public.ai_provider_fallbacks         FROM anon, authenticated;
REVOKE ALL ON public.stripe_deposit_routing_events FROM anon, authenticated;
REVOKE ALL ON restaurant.stripe_connect_accounts   FROM anon, authenticated;

ALTER TABLE public.ai_spend                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_provider_fallbacks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_deposit_routing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant.stripe_connect_accounts   ENABLE ROW LEVEL SECURITY;

-- 2. As cinco sem grant — defesa em profundidade, não correção de exposição.
ALTER TABLE restaurant.event_bookings            ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant.customer_notes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant.scheduled_instagram_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant.instagram_video_jobs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant.ai_generation_events      ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.ai_spend IS
  'Custo REAL por chamada de LLM, vindo de cost_details do OpenRouter (usage.include=true) — nao e estimativa. Service-role-only via RLS desde 2026-09-01: anon tinha TUDO, inclusive TRUNCATE, sobre 1362 linhas de custo real.';
COMMENT ON TABLE restaurant.stripe_connect_accounts IS
  'Contas Stripe Connect por restaurante. Service-role-only via RLS desde 2026-09-01 — antes, qualquer usuário autenticado lia a linha de TODOS os restaurantes (cruzamento de inquilino em dado financeiro).';

-- VERIFICAÇÃO FEITA APÓS APLICAR, com SET ROLE:
--   anon         → permission denied nas quatro
--   service_role → leu as nove (ai_spend 1368, event_bookings 24, resto 0)
-- E o advisor crítico `rls_disabled` saiu da lista; sobrou `rls_enabled_no_policy`
-- em nível INFO, que é o mesmo estado das tabelas-precedente acima.
