# Retain physical assignments when a guest reschedules

## Confirmed root and bounded fix

The earlier aggregate-only reschedule cleared `table_ids`. This was unsafe for
native-created bookings: `api/_lib/tool-handlers.js:createReservation` stores
`canAccommodateParty(...).table_ids`, and `api/_lib/db/tables.js:getBookedTableIds`
uses those IDs to exclude overlapping reservations' tables. An empty array makes
that reservation invisible to the physical-table check. Aggregate seat admission
alone does not preserve physical availability.

The follow-up migration replaces only `mutate_guest_reservation`. Existing
assigned reservations keep their exact original `table_ids` on a successful
change. Admission additionally requires every assigned table to belong to this
tenant, exist, remain active, have positive capacity, and collectively fit the
new party. Null/duplicate references and assignments over three tables refuse.
Multiple tables must satisfy the current native combination rules in their
stored order: no fixed tables, explicit adjacency first, then two explicit
combination groups, then the same location. This includes the native three-table
chain. The source schema declares UUID table IDs and adjacent-table arrays;
comparison casts also support existing text-array reservation references.

The RPC holds assigned table rows with `FOR SHARE` until commit and refuses
physical overlap with another confirmed, seated, or pending reservation,
excluding itself. The check includes neighboring dates for overnight overlap.
The existing restaurant-local clock, business-hours, last-seating, aggregate
capacity, ownership, status, and restaurant-lock checks still apply. Current
occupied/reserved table status is not a future-date veto, consistent with
`canAccommodateParty`, which filters active tables and dated reservations.

If any check fails, **the entire reservation remains unchanged**. This bounded
patch does not choose another assignment, even when another table could fit.
Cancellation still releases references once; repeated cancellation is unchanged.
Pre-existing unassigned WhatsApp bookings remain aggregate-only. The prior note
about clearing assignments on reschedule is superseded by this follow-up.

## Evidence and remaining checks

Only the follow-up SQL, its integration harness, and this new leaf document
changed. No native adapters, JS runtime, Supabase modules, provider configuration,
DB records, or original dirty checkout were edited. Nothing was pushed or
applied. Voice creation still takes neither this restaurant lock nor the assigned
table locks. This is not a universal cross-channel concurrency guarantee.

The focused core/adapter run passed **79 tests across five suites**. JavaScript
syntax and diff checks passed. These tests do not execute the new SQL.

The disposable local-PG harness now loads both migrations and defines **50 SQL
integration cases**. The original 29 cases remain, with successful reschedules
now asserting retained IDs. Twenty-one cases add insufficient assigned capacity
despite spare tables; inactive/missing/foreign/null/duplicate IDs; physical
confirmed/seated/pending overlap despite spare aggregate seats; overnight
conflict; cancelled and touching-boundary non-conflicts; occupied current status
with a valid future booking; pair combination rules; a valid three-table chain;
and an unassigned WhatsApp booking. The two concurrent partial-change cases now
also assert the original physical assignment survives both orderings.

The follow-up harness was **not executed** under the no-DB-writes instruction.
The parent's previously reported 29-case pass applies to the earlier migration.
Before enabling provider flows, the parent must run the new harness in a fresh
local cluster and test the resulting RPC against the real sandbox schema.

For a red reproduction, run the same fresh-cluster harness with
`STB_MUTATIONS_BASE_ONLY=1`. It loads only the earlier mutation migration, then
must fail the full-capacity reschedule assertion because its returned `table_ids`
is empty. With that variable unset, both migrations load and the retention and
physical-conflict cases are exercised. Each mode needs its own fresh disposable
cluster; the harness intentionally refuses existing application tables.
