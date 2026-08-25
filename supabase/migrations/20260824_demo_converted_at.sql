-- Demo em Conversa F6: marca a conversão do demo (usuário criou conta real).
-- Usado para (a) parar o nurture drip pós-conversão e (b) auditoria do funil.
-- O demo continua is_demo=true com demo_expires_at — o cleanup cron o remove
-- no vencimento normalmente.
-- APLICADA em prod via Supabase MCP em 2026-08-24.
ALTER TABLE restaurant.restaurant_config
  ADD COLUMN IF NOT EXISTS demo_converted_at TIMESTAMPTZ;

COMMENT ON COLUMN restaurant.restaurant_config.demo_converted_at IS
  'Momento em que o dono do demo criou a conta real (POST /api/demo/convert). Nurture para; cleanup cron segue normal.';
