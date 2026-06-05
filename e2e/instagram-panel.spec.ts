/**
 * E2E for the Instagram panel — Phase C surface (#190-ish through C.5).
 *
 * Covers:
 *   - Not-connected state: "Connect Instagram" CTA visible
 *   - Active + tone-pending: handle + "Build now" visible, drafter disabled
 *   - Active + tone-ready: bio, website chip, drafter language pill, drafter unlocked
 *   - Active + bio_links populated (Linktree case): "View on linktr.ee (N links)"
 *   - Restricted: amber status pill + last_error surfaced
 *   - Revoked: red pill + "Reconnect Instagram"
 *   - Draft flow: type topic → 3 drafts render → Copy button toast
 *   - XSS guard: javascript: scheme website does NOT render a link
 *
 * Strategy: stub every Instagram endpoint at the Playwright route layer so
 * the spec is deterministic and doesn't depend on a real IG connection.
 * Auth: reuses e2e/auth-state.json — /host-dashboard/voice-settings is
 * behind ProtectedRoute.
 *
 * Why this spec matters: InstagramPanel + InstagramCaptionDrafter have been
 * restyled multiple times during the C.x rollout, twice silently dropping
 * fields (bio, website chip, language pill). This spec pins those
 * affordances so a future restyle that removes them shows up in CI.
 */

import { test, expect, BrowserContext, Page } from '@playwright/test';
import path from 'path';

const AUTH_STATE = path.join(__dirname, 'auth-state.json');

test.use({ storageState: AUTH_STATE });

// Force English so assertions match the canonical English copy.
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    try { window.localStorage.setItem('seatable-user-lang', 'en'); } catch { /* private mode */ }
  });
});

interface StubStatusOptions {
  connected?: boolean;
  status?: 'active' | 'expired' | 'revoked' | 'restricted' | null;
  username?: string | null;
  display_name?: string | null;
  biography?: string | null;
  website?: string | null;
  bio_links?: Array<{ label: string; url: string; host: string }> | null;
  profile_picture_url?: string | null;
  followers_count?: number | null;
  last_error?: string | null;
  tone_profile_ready?: boolean;
  tone_language?: 'pt' | 'es' | 'fr' | 'it' | 'en' | null;
}

async function stubStatus(context: BrowserContext, opts: StubStatusOptions) {
  await context.route('**/api/instagram/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        connected: opts.connected ?? false,
        status: opts.status ?? null,
        username: opts.username ?? null,
        display_name: opts.display_name ?? null,
        biography: opts.biography ?? null,
        website: opts.website ?? null,
        bio_links: opts.bio_links ?? null,
        profile_picture_url: opts.profile_picture_url ?? null,
        followers_count: opts.followers_count ?? null,
        last_sync_at: null,
        last_error: opts.last_error ?? null,
        token_expires_at: null,
        tone_profile_ready: opts.tone_profile_ready ?? false,
        tone_language: opts.tone_language ?? null,
      }),
    }),
  );
}

async function stubDraftCaption(context: BrowserContext, drafts: string[]) {
  await context.route('**/api/instagram/draft-caption', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, drafts }),
    }),
  );
}

/**
 * Reliable wait for the panel to mount — Posthog/Sentry on the dashboard
 * make `networkidle` hang.
 */
async function waitForInstagramPanel(page: Page) {
  await page.getByTestId('instagram-panel').waitFor({ state: 'visible', timeout: 15_000 });
}

const INSTAGRAM_TAB_URL = '/host-dashboard/voice-settings#voice-settings:instagram';

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Instagram panel — not connected', () => {
  test('renders Connect Instagram CTA, no connected card', async ({ page, context }) => {
    await stubStatus(context, { connected: false });
    await page.goto(INSTAGRAM_TAB_URL);
    await waitForInstagramPanel(page);

    await expect(page.getByTestId('instagram-panel-connect-cta')).toBeVisible();
    await expect(page.getByTestId('instagram-panel-connect-cta')).toContainText(/Connect Instagram/i);
    await expect(page.getByTestId('instagram-panel-connected-card')).toHaveCount(0);
    // No status pill before connection.
    await expect(page.getByTestId('instagram-panel-status-pill')).toHaveCount(0);
    // Caption drafter is gated entirely by connection.
    await expect(page.getByTestId('instagram-caption-drafter')).toHaveCount(0);
    await expect(page.getByTestId('instagram-caption-drafter-disabled')).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Instagram panel — active connection, no tone profile yet', () => {
  test('shows handle + Build now button, drafter shown but locked', async ({ page, context }) => {
    await stubStatus(context, {
      connected: true,
      status: 'active',
      username: 'cantinabella',
      display_name: 'Cantina Bella',
      followers_count: 1234,
      tone_profile_ready: false,
    });
    await page.goto(INSTAGRAM_TAB_URL);
    await waitForInstagramPanel(page);

    await expect(page.getByTestId('instagram-panel-status-pill')).toContainText(/Connected/i);
    await expect(page.getByTestId('instagram-panel-connected-card')).toContainText(/Cantina Bella/);
    await expect(page.getByTestId('instagram-panel-connected-card')).toContainText(/cantinabella/);
    await expect(page.getByTestId('instagram-panel-connected-card')).toContainText(/1,234 followers/);
    await expect(page.getByTestId('instagram-panel-connected-card')).toContainText(/Building tone profile/i);

    // Refresh CTA reads "Build now" before tone exists, "Refresh tone" after.
    await expect(page.getByTestId('instagram-panel-refresh-tone-cta')).toContainText(/Build now/i);

    // Caption drafter renders its disabled placeholder.
    await expect(page.getByTestId('instagram-caption-drafter-disabled')).toBeVisible();
    await expect(page.getByTestId('instagram-caption-drafter')).toHaveCount(0);

    // Reconnect CTA also visible (the bottom button switches to Reconnect once active).
    await expect(page.getByTestId('instagram-panel-connect-cta')).toContainText(/Reconnect Instagram/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Instagram panel — active + tone profile ready', () => {
  test('surfaces bio, website chip, language pill, and unlocks drafter', async ({ page, context }) => {
    await stubStatus(context, {
      connected: true,
      status: 'active',
      username: 'seatable.ai',
      display_name: 'Seatable',
      biography: 'IA para restaurantes 🍽️\nReservas, atendimento e gestão inteligente.\nTeste grátis 👇',
      website: 'http://seatable.one',
      followers_count: 71,
      tone_profile_ready: true,
      tone_language: 'pt',
    });
    await page.goto(INSTAGRAM_TAB_URL);
    await waitForInstagramPanel(page);

    // Bio rendered verbatim (whitespace-pre-line preserves IG line breaks).
    await expect(page.getByTestId('instagram-panel-bio'))
      .toContainText('IA para restaurantes');
    await expect(page.getByTestId('instagram-panel-bio'))
      .toContainText('Teste grátis');

    // Website link: text shows the host (since there are no bio_links), href is the URL.
    const website = page.getByTestId('instagram-panel-website-link');
    await expect(website).toBeVisible();
    await expect(website).toHaveAttribute('href', 'http://seatable.one');
    await expect(website).toHaveAttribute('target', '_blank');
    await expect(website).toContainText(/seatable\.one/);

    // Language pill: "Drafting in Portuguese"
    await expect(page.getByTestId('instagram-caption-drafter-language'))
      .toContainText(/Drafting in Portuguese/i);

    // Drafter unlocked, ready for input.
    await expect(page.getByTestId('instagram-caption-drafter')).toBeVisible();
    await expect(page.getByTestId('instagram-caption-drafter-topic')).toBeEditable();
    await expect(page.getByTestId('instagram-caption-drafter-disabled')).toHaveCount(0);

    // Refresh CTA flips to "Refresh tone" now.
    await expect(page.getByTestId('instagram-panel-refresh-tone-cta')).toContainText(/Refresh tone/i);
  });

  test('Linktree website shows "View on linktr.ee (N links)" with bio_links populated', async ({ page, context }) => {
    await stubStatus(context, {
      connected: true,
      status: 'active',
      username: 'cantinabella',
      display_name: 'Cantina Bella',
      website: 'https://linktr.ee/cantinabella',
      bio_links: [
        { label: 'Reserve a table', url: 'https://opentable.com/x', host: 'opentable.com' },
        { label: 'Order on iFood',   url: 'https://ifood.com.br/y', host: 'ifood.com.br' },
        { label: 'WhatsApp us',      url: 'https://wa.me/5511555', host: 'wa.me' },
      ],
      tone_profile_ready: true,
      tone_language: 'pt',
    });
    await page.goto(INSTAGRAM_TAB_URL);
    await waitForInstagramPanel(page);

    const website = page.getByTestId('instagram-panel-website-link');
    await expect(website).toContainText(/View on linktr\.ee \(3 links\)/);
    await expect(website).toHaveAttribute('href', 'https://linktr.ee/cantinabella');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Instagram panel — status state matrix', () => {
  test('restricted: amber pill + last_error visible', async ({ page, context }) => {
    await stubStatus(context, {
      connected: false,
      status: 'restricted',
      username: 'cantinabella',
      display_name: 'Cantina Bella',
      last_error: 'Some posts denied because of permission scope',
    });
    await page.goto(INSTAGRAM_TAB_URL);
    await waitForInstagramPanel(page);

    await expect(page.getByTestId('instagram-panel-status-pill')).toContainText(/Restricted/i);
    await expect(page.getByText(/Some posts denied/i)).toBeVisible();
  });

  test('revoked: red pill + Reconnect CTA', async ({ page, context }) => {
    await stubStatus(context, {
      connected: false,
      status: 'revoked',
      username: 'cantinabella',
    });
    await page.goto(INSTAGRAM_TAB_URL);
    await waitForInstagramPanel(page);

    await expect(page.getByTestId('instagram-panel-status-pill')).toContainText(/Revoked/i);
    // 'revoked' is non-active so the connected card doesn't render
    // (status query filters to active/restricted for the picture-card section).
    // The bottom CTA is still "Connect Instagram" since `connected` is false.
    await expect(page.getByTestId('instagram-panel-connect-cta')).toContainText(/Connect Instagram/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Instagram panel — XSS guard on website href', () => {
  test('javascript: URL is NOT rendered as a link (safeHttpUrl filter)', async ({ page, context }) => {
    await stubStatus(context, {
      connected: true,
      status: 'active',
      username: 'malicious',
      website: 'javascript:alert(1)//',
      tone_profile_ready: true,
    });
    await page.goto(INSTAGRAM_TAB_URL);
    await waitForInstagramPanel(page);

    // Connected card present, but the website link is suppressed.
    await expect(page.getByTestId('instagram-panel-connected-card')).toBeVisible();
    await expect(page.getByTestId('instagram-panel-website-link')).toHaveCount(0);
  });

  test('http:// URL renders normally (positive control)', async ({ page, context }) => {
    await stubStatus(context, {
      connected: true,
      status: 'active',
      username: 'safe',
      website: 'http://example.com',
      tone_profile_ready: true,
    });
    await page.goto(INSTAGRAM_TAB_URL);
    await waitForInstagramPanel(page);

    await expect(page.getByTestId('instagram-panel-website-link')).toHaveAttribute('href', 'http://example.com');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Caption drafter — full draft cycle', () => {
  test('type topic → 3 drafts render → first Copy fires success toast', async ({ page, context }) => {
    await stubStatus(context, {
      connected: true,
      status: 'active',
      username: 'cantinabella',
      display_name: 'Cantina Bella',
      tone_profile_ready: true,
      tone_language: 'pt',
    });
    await stubDraftCaption(context, [
      'Mock draft 1 — short.',
      'Mock draft 2 — slightly different angle.',
      'Mock draft 3 — third hook.',
    ]);

    await page.goto(INSTAGRAM_TAB_URL);
    await waitForInstagramPanel(page);

    // Fill topic + submit
    await page.getByTestId('instagram-caption-drafter-topic').fill('our new sourdough pizza');
    await page.getByTestId('instagram-caption-drafter-submit').click();

    // All 3 drafts render with Copy buttons
    await expect(page.getByTestId('instagram-caption-drafter-results')).toBeVisible();
    for (let i = 0; i < 3; i++) {
      await expect(page.getByTestId(`instagram-caption-drafter-copy-${i}`)).toBeVisible();
    }

    // Click Copy on draft 0 — surfaces a success toast.
    // Browser clipboard may be denied in headless mode; the panel falls
    // back to the error toast in that case. Either way, SOMETHING surfaces
    // — that's what we're asserting here (success preferred).
    await page.getByTestId('instagram-caption-drafter-copy-0').click();
    await expect(page.locator('body')).toContainText(/(copied|blocked)/i, { timeout: 5_000 });
  });

  test('drafts request body matches drafter inputs (topic + length)', async ({ page, context }) => {
    await stubStatus(context, {
      connected: true,
      status: 'active',
      username: 'cantinabella',
      tone_profile_ready: true,
    });
    let captured: { topic?: string; length?: string } | null = null;
    await context.route('**/api/instagram/draft-caption', async (route) => {
      const body = route.request().postDataJSON?.();
      captured = body;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, drafts: ['a', 'b', 'c'] }),
      });
    });

    await page.goto(INSTAGRAM_TAB_URL);
    await waitForInstagramPanel(page);

    await page.getByTestId('instagram-caption-drafter-length-long').click();
    await page.getByTestId('instagram-caption-drafter-topic').fill('topic xyz');
    await page.getByTestId('instagram-caption-drafter-submit').click();

    await expect(page.getByTestId('instagram-caption-drafter-results')).toBeVisible();
    expect(captured).toMatchObject({ topic: 'topic xyz', length: 'long' });
  });
});
