#!/usr/bin/env bash
# Reproduções da auditoria de 11/11/2026 (tasks/audit-2026-11-11.md).
# Sobe um Postgres 16 descartável, carrega as migrações reais das funções de
# reserva e roda cada caso. Não fala com Supabase, Twilio, ElevenLabs nem Meta.
# Uso: bash scripts/auditoria-reservas/run.sh   (precisa de initdb/pg_ctl/psql e node_modules)
set -euo pipefail
export LC_ALL=C LANG=C
DIR=$(cd "$(dirname "$0")" && pwd); REPO=$(cd "$DIR/../.." && pwd)
DATA=$(mktemp -d); SOCK=$(mktemp -d /tmp/aud.XXXX)
trap 'pg_ctl -D "$DATA" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DATA" "$SOCK"' EXIT
initdb -D "$DATA" -U postgres --auth=trust >/dev/null
pg_ctl -D "$DATA" -o "-k $SOCK -p 55441 -c listen_addresses=''" -l "$DATA/pg.log" -w start >/dev/null
createdb -h "$SOCK" -p 55441 -U postgres audit
psql -h "$SOCK" -p 55441 -U postgres -d audit -v ON_ERROR_STOP=1 -q -f "$DIR/fixture-schema.sql"
for m in 20261016184431_whatsapp_booking_integrity 20261109002803_reservation_whatsapp_receipts \
         20261109231933_voice_booking_external_key_guard 20261110174209_guest_reservation_mutations \
         20261110180955_retain_guest_reservation_table_assignment 20261111004327_sandbox_keypad_reservation_actions \
         20261112150000_book_guest_reservation; do
  psql -h "$SOCK" -p 55441 -U postgres -d audit -v ON_ERROR_STOP=1 -q -f "$REPO/supabase/migrations/$m.sql" >/dev/null 2>&1
done
export AUDIT_SOCK="$SOCK" AUDIT_REPO="$REPO" NODE_PATH="$REPO/node_modules"
for f in r1-portal r2-voz-restaurante c1-concorrencia r4-canais c4-criacao-concorrente; do
  echo "== $f"; TZ=UTC node "$DIR/$f.cjs" 2>/dev/null | grep -E '^[│┌└├{]'
done
for tz in UTC America/Sao_Paulo; do echo "== r3-fuso TZ=$tz"; TZ=$tz node "$DIR/r3-fuso.cjs" 2>/dev/null | grep '^{'; done
