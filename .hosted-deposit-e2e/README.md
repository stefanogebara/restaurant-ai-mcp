# Hosted reservation deposit sandbox

Run from the worktree root with Node dependencies, Docker Compose, Google Chrome and Stripe CLI available. The prevalidated billing worktree must be next to this worktree. Its account guard reads the private profile at `~/.config/seatable-billing-e2e/cli-sandbox.toml` and verifies the test-only Seatable account before any provider write.

```sh
env -i PATH="$PATH" HOME="$HOME" node .hosted-deposit-e2e/run.cjs
```

Each run creates a unique Postgres/PostgREST Compose project and Stripe CLI listener on loopback. It uses the real link and webhook handlers, a synthetic local Supabase Auth endpoint and the checkout page served by Stripe. The return path uses a local stub. The test asserts that one link survives a lost response and racing requests, a signed completion attaches an uncaptured authorization once, a missing webhook can be recovered by requesting the link again, and mismatched reservations release the hold. It models an already captured deposit by storing the amount that the capture handler retains. No test charge is captured.

The guard tests exercise the service-only SQL functions against Postgres. Jest covers Connect destination request and verification shapes, fallback, wrong mode and tenant, and the other Stripe webhook paths. The dedicated account has no enabled connected test account, so Chrome and provider coverage use the platform route.

The harness writes redacted evidence to `result.json`. A completed run requires `passed`, `cleanupVerified` and `databaseRemoved`. Cleanup expires tagged open sessions, cancels tagged uncaptured holds and removes the local database. Historical Stripe test records remain.

## Pre-release Checkout links

Links made before this migration have no durable quote or slot binding. The hosted handler requires its own Checkout marker and a matching stored attempt. An old open link may still authorize a card at Stripe, but this handler will neither attach nor automatically release it. Inventory and retire those open links before rollout. A legacy hold already attached to a reservation remains available to the existing capture and release endpoints.
