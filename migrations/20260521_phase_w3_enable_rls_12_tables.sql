-- Phase W.3: enable RLS on the 12 tables Supabase advisors flagged as
-- `rls_disabled_in_public`. All 12 are accessed exclusively via supabaseAdmin
-- (service_role) — verified by grepping the API codebase. Service role
-- bypasses RLS, so enabling RLS with no policies is safe: legitimate paths
-- keep working, anon/authenticated PostgREST traffic is denied.
--
-- The single most important fix here is `public.restaurant_registry`. That
-- table stores `supabase_service_role_key` per tenant. With RLS disabled,
-- any caller holding the public anon key could read every tenant's
-- service-role key — full DB compromise. We close that hole.

-- Public schema --------------------------------------------------------------
ALTER TABLE public.guest_feedback        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_recipients   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_consent      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_flags    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_menu_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenue_records       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.briefings_log         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_registry   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waha_events           ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON
  public.guest_feedback,
  public.whatsapp_sessions,
  public.campaign_recipients,
  public.customer_consent,
  public.conversation_flags,
  public.pos_menu_items,
  public.revenue_records,
  public.briefings_log,
  public.restaurant_registry,
  public.waha_events
FROM anon, authenticated;

COMMENT ON TABLE public.restaurant_registry IS
  'Phase W.3: stores per-tenant service_role keys. Service-role-only via RLS. '
  'Previously RLS-disabled — any caller with the public anon key could read '
  'every tenant''s credentials.';

-- restaurant schema ----------------------------------------------------------
ALTER TABLE restaurant.restaurant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant.voice_ab_tests     ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON
  restaurant.restaurant_members,
  restaurant.voice_ab_tests
FROM anon, authenticated;
