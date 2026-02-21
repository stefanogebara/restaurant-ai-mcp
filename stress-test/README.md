# Stress Test Suite

Tests concurrent load against a Vercel preview deployment. Covers three failure modes:
1. **Double-booking** — concurrent reservation creates for the same slot
2. **Rate limiting** — burst requests to trigger Upstash Redis 429s
3. **DB connection load** — mixed concurrent reads at peak dinner service

## Setup

### 1. Deploy a preview branch

```bash
git checkout -b stress-test
git push origin stress-test
```

Vercel will auto-deploy. Copy the preview URL (e.g. `https://restaurant-ai-mcp-abc123-....vercel.app`).

### 2. Get a test JWT

1. Open the preview URL in your browser
2. Log in with Google
3. Open DevTools → Application → Local Storage
4. Copy the `auth_token` value

### 3. Set env vars

```bash
export PREVIEW_URL="https://restaurant-ai-mcp-abc123-....vercel.app"
export TEST_JWT="eyJ..."
```

### 4. Run the stress test

```bash
npm run test:stress
```

Or with HTML report:

```bash
npx artillery run stress-test/artillery.yml --output stress-test/report.json
npx artillery report stress-test/report.json --output stress-test/report.html
open stress-test/report.html
```

## After the test

### Verify no double-bookings

```bash
node stress-test/verify.js
```

### Clean up test data

```bash
node stress-test/cleanup.js
```

Or both at once:

```bash
npm run stress:verify && npm run stress:cleanup
```

## Load Phases

| Phase    | Duration | Rate       |
|----------|----------|------------|
| Warm-up  | 30s      | 2 req/s    |
| Ramp-up  | 60s      | 2→25 req/s |
| Peak     | 60s      | 25 req/s   |
| Spike    | 20s      | 60 req/s   |

## Success Criteria

- Zero double-bookings for the same slot
- 429s appear during rate limit burst (not 500s)
- p95 response time < 2000ms at peak load
- No 500s during warm-up and ramp-up phases
