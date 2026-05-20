-- Phase W.4 + W.5: function search_path hardening + anon RPC lockdown.
--
-- W.4 — `function_search_path_mutable` advisor warning.
-- Without a fixed search_path, a SECURITY DEFINER function can be hijacked by
-- a caller who sets their session search_path to point at a malicious schema
-- that shadows tables the function reads. Forcing search_path='' makes every
-- reference inside the function require a schema-qualified name (catching
-- bugs at definition time, not runtime) and removes the attack surface.
--
-- W.5 — SECURITY DEFINER RPCs reachable from `/rest/v1/rpc/*` by anon.
--   - public.get_user_restaurant_id() returns the caller's tenant; an anon
--     caller has no JWT subject so the function returns NULL, but exposing
--     it leaks the schema. Revoke anon.
--   - public.increment_usage(...) mutates billing meters. Anon must not call
--     this. Server-side cron is the only legitimate caller.
--   - public.retrieve_guest_memories(...) + public.match_manager_memories(...)
--     return PII-rich memory rows for the manager AI; both are only called
--     by the server via supabaseAdmin. Revoke anon + authenticated.

-- W.4 ----------------------------------------------------------------------
ALTER FUNCTION public.retrieve_guest_memories                       SET search_path = '';
ALTER FUNCTION public.match_manager_memories                        SET search_path = '';
ALTER FUNCTION restaurant.confirm_event_booking                     SET search_path = '';
ALTER FUNCTION restaurant.cancel_event_booking                      SET search_path = '';
ALTER FUNCTION restaurant.set_updated_at()                          SET search_path = '';
ALTER FUNCTION restaurant.touch_proactive_comms_queue_updated_at()  SET search_path = '';

-- W.5 ----------------------------------------------------------------------
-- PostgreSQL grants EXECUTE on every new function to PUBLIC by default. The
-- explicit anon/authenticated revokes below are not sufficient on their own —
-- both roles inherit EXECUTE from PUBLIC. We REVOKE FROM PUBLIC first, then
-- re-grant only what the app actually needs.

REVOKE EXECUTE ON FUNCTION public.get_user_restaurant_id() FROM PUBLIC, anon;
-- Keep authenticated EXECUTE so the RLS policies created in W.2 can resolve
-- the caller's tenant. PostgREST policy evaluation runs under the caller's
-- role; revoking authenticated here would break tenant scoping outright.
GRANT EXECUTE ON FUNCTION public.get_user_restaurant_id() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.increment_usage(uuid, text, date)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.retrieve_guest_memories(uuid, text, vector, integer, double precision, double precision, double precision)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.match_manager_memories(uuid, vector, integer)
  FROM PUBLIC, anon, authenticated;
