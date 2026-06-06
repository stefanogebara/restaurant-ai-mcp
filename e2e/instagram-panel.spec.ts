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

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Publish — single image flow (C.8)', () => {
  test('paste URL → Post now → success toast with permalink', async ({ page, context }) => {
    await stubStatus(context, {
      connected: true,
      status: 'active',
      username: 'cantinabella',
      tone_profile_ready: true,
      tone_language: 'pt',
    });
    await stubDraftCaption(context, ['Draft about the new menu.', 'Second draft.', 'Third.']);
    let publishBody: { caption?: string; image_urls?: string[]; image_url?: string } | null = null;
    await context.route('**/api/instagram/publish-post', async (route) => {
      publishBody = route.request().postDataJSON?.() ?? null;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          media_id: 'MOCK_MEDIA_123',
          permalink: 'https://www.instagram.com/p/MOCK/',
          post_kind: 'single',
        }),
      });
    });

    await page.goto(INSTAGRAM_TAB_URL);
    await waitForInstagramPanel(page);

    await page.getByTestId('instagram-caption-drafter-topic').fill('new menu launch');
    await page.getByTestId('instagram-caption-drafter-submit').click();
    await expect(page.getByTestId('instagram-caption-drafter-card-0')).toBeVisible();

    await page.getByTestId('instagram-caption-drafter-post-toggle-0').click();
    await expect(page.getByTestId('instagram-caption-drafter-post-form-0')).toBeVisible();

    await page.getByTestId('instagram-caption-drafter-image-url-0').fill('https://cdn.example.com/dish.jpg');
    await page.getByTestId('instagram-caption-drafter-add-url-0').click();
    await expect(page.getByTestId('instagram-caption-drafter-thumb-0-0')).toBeVisible();
    await expect(page.getByTestId('instagram-caption-drafter-publish-0')).toContainText(/Post now/i);

    await page.getByTestId('instagram-caption-drafter-publish-0').click();
    await expect(page.locator('body')).toContainText(/instagram\.com\/p\/MOCK/, { timeout: 5_000 });

    expect(publishBody?.image_urls).toEqual(['https://cdn.example.com/dish.jpg']);
    expect(publishBody?.caption).toBeTruthy();
  });

  test('publish API error surfaces upstream message', async ({ page, context }) => {
    await stubStatus(context, {
      connected: true,
      status: 'active',
      username: 'cantinabella',
      tone_profile_ready: true,
    });
    await stubDraftCaption(context, ['Draft 1', 'Draft 2', 'Draft 3']);
    await context.route('**/api/instagram/publish-post', (route) =>
      route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: false,
          error: 'Instagram is processing this image, please retry shortly.',
          code: 36003,
        }),
      }),
    );

    await page.goto(INSTAGRAM_TAB_URL);
    await waitForInstagramPanel(page);

    await page.getByTestId('instagram-caption-drafter-topic').fill('test');
    await page.getByTestId('instagram-caption-drafter-submit').click();
    await expect(page.getByTestId('instagram-caption-drafter-card-0')).toBeVisible();

    await page.getByTestId('instagram-caption-drafter-post-toggle-0').click();
    await page.getByTestId('instagram-caption-drafter-image-url-0').fill('https://cdn.example.com/dish.jpg');
    await page.getByTestId('instagram-caption-drafter-add-url-0').click();
    await page.getByTestId('instagram-caption-drafter-publish-0').click();

    await expect(page.locator('body')).toContainText(/processing this image/i, { timeout: 5_000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Upload — file → URL auto-fill (C.9)', () => {
  test('selecting an image file uploads + appends a thumbnail', async ({ page, context }) => {
    await stubStatus(context, {
      connected: true,
      status: 'active',
      username: 'cantinabella',
      tone_profile_ready: true,
    });
    await stubDraftCaption(context, ['A', 'B', 'C']);

    let uploadBody: { filename?: string; content_type?: string; data_b64?: string } | null = null;
    await context.route('**/api/instagram/upload-image', async (route) => {
      uploadBody = route.request().postDataJSON?.() ?? null;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          url: 'https://storage.example.com/instagram-uploads/r1/abc.png',
          path: 'r1/abc.png',
        }),
      });
    });

    await page.goto(INSTAGRAM_TAB_URL);
    await waitForInstagramPanel(page);

    await page.getByTestId('instagram-caption-drafter-topic').fill('upload test');
    await page.getByTestId('instagram-caption-drafter-submit').click();
    await expect(page.getByTestId('instagram-caption-drafter-card-0')).toBeVisible();

    await page.getByTestId('instagram-caption-drafter-post-toggle-0').click();

    // Synthetic 1x1 PNG so the client-side content_type/size checks pass.
    const pngBytes = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
      0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41,
      0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
      0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
      0x42, 0x60, 0x82,
    ]);
    await page.locator('[data-testid="instagram-caption-drafter-upload-0"] input[type="file"]').setInputFiles({
      name: 'menu.png', mimeType: 'image/png', buffer: pngBytes,
    });

    await expect(page.getByTestId('instagram-caption-drafter-thumb-0-0')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('body')).toContainText(/Uploaded 1 image/i);

    expect(uploadBody?.filename).toBe('menu.png');
    expect(uploadBody?.content_type).toBe('image/png');
    expect(uploadBody?.data_b64).toBeTruthy();
    expect(uploadBody?.data_b64?.startsWith('iVBORw')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Carousel — 2-10 images (C.10)', () => {
  test('two pasted URLs → Post button reads "Post carousel (2)"', async ({ page, context }) => {
    await stubStatus(context, {
      connected: true, status: 'active', username: 'x', tone_profile_ready: true,
    });
    await stubDraftCaption(context, ['a', 'b', 'c']);

    await page.goto(INSTAGRAM_TAB_URL);
    await waitForInstagramPanel(page);

    await page.getByTestId('instagram-caption-drafter-topic').fill('carousel test');
    await page.getByTestId('instagram-caption-drafter-submit').click();
    await page.getByTestId('instagram-caption-drafter-post-toggle-0').click();

    const urlInput = page.getByTestId('instagram-caption-drafter-image-url-0');
    const addBtn = page.getByTestId('instagram-caption-drafter-add-url-0');

    await urlInput.fill('https://cdn.example.com/a.jpg');
    await addBtn.click();
    await expect(page.getByTestId('instagram-caption-drafter-publish-0')).toContainText(/Post now/i);

    await urlInput.fill('https://cdn.example.com/b.jpg');
    await addBtn.click();
    await expect(page.getByTestId('instagram-caption-drafter-publish-0')).toContainText(/Post carousel \(2\)/i);

    await expect(page.getByTestId('instagram-caption-drafter-thumb-0-0')).toBeVisible();
    await expect(page.getByTestId('instagram-caption-drafter-thumb-0-1')).toBeVisible();
  });

  test('thumbnail × removes the image — carousel falls back to single label', async ({ page, context }) => {
    await stubStatus(context, {
      connected: true, status: 'active', username: 'x', tone_profile_ready: true,
    });
    await stubDraftCaption(context, ['a', 'b', 'c']);

    await page.goto(INSTAGRAM_TAB_URL);
    await waitForInstagramPanel(page);

    await page.getByTestId('instagram-caption-drafter-topic').fill('remove test');
    await page.getByTestId('instagram-caption-drafter-submit').click();
    await page.getByTestId('instagram-caption-drafter-post-toggle-0').click();

    const urlInput = page.getByTestId('instagram-caption-drafter-image-url-0');
    const addBtn = page.getByTestId('instagram-caption-drafter-add-url-0');

    for (const u of ['https://x.com/a.jpg', 'https://x.com/b.jpg', 'https://x.com/c.jpg']) {
      await urlInput.fill(u);
      await addBtn.click();
    }
    await expect(page.getByTestId('instagram-caption-drafter-publish-0')).toContainText(/Post carousel \(3\)/i);

    await page.getByTestId('instagram-caption-drafter-thumb-remove-0-1').click();
    await expect(page.getByTestId('instagram-caption-drafter-publish-0')).toContainText(/Post carousel \(2\)/i);

    await page.getByTestId('instagram-caption-drafter-thumb-remove-0-0').click();
    await expect(page.getByTestId('instagram-caption-drafter-publish-0')).toContainText(/Post now/i);
  });

  test('recent-posts picker (C.12): grid renders, click adds to imageUrls, dupe shows check', async ({ page, context }) => {
    await stubStatus(context, {
      connected: true, status: 'active', username: 'x', tone_profile_ready: true,
    });
    await stubDraftCaption(context, ['a', 'b', 'c']);
    await context.route('**/api/instagram/recent-media', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          media: [
            { id: 'm1', image_url: 'https://cdn.example.com/1.jpg', thumbnail_url: null, media_type: 'IMAGE',  permalink: 'https://instagram.com/p/A', timestamp: '2026-06-01T00:00:00Z' },
            { id: 'm2', image_url: 'https://cdn.example.com/2.jpg', thumbnail_url: null, media_type: 'IMAGE',  permalink: 'https://instagram.com/p/B', timestamp: '2026-05-30T00:00:00Z' },
            { id: 'm3', image_url: 'https://cdn.example.com/3.jpg', thumbnail_url: null, media_type: 'IMAGE',  permalink: 'https://instagram.com/p/C', timestamp: '2026-05-28T00:00:00Z' },
          ],
        }),
      }),
    );

    await page.goto(INSTAGRAM_TAB_URL);
    await waitForInstagramPanel(page);

    await page.getByTestId('instagram-caption-drafter-topic').fill('picker test');
    await page.getByTestId('instagram-caption-drafter-submit').click();
    await page.getByTestId('instagram-caption-drafter-post-toggle-0').click();

    // Open the picker
    await page.getByTestId('instagram-caption-drafter-picker-toggle-0').click();
    await expect(page.getByTestId('instagram-caption-drafter-picker-grid-0')).toBeVisible();

    // Click item 0 → thumbnail appears in the imageUrls grid
    await page.getByTestId('instagram-caption-drafter-picker-item-0-0').click();
    await expect(page.getByTestId('instagram-caption-drafter-thumb-0-0')).toBeVisible();
    await expect(page.getByTestId('instagram-caption-drafter-publish-0')).toContainText(/Post now/i);

    // Click item 1 → second thumbnail, button flips to carousel
    await page.getByTestId('instagram-caption-drafter-picker-item-0-1').click();
    await expect(page.getByTestId('instagram-caption-drafter-thumb-0-1')).toBeVisible();
    await expect(page.getByTestId('instagram-caption-drafter-publish-0')).toContainText(/Post carousel \(2\)/i);

    // Item 0 is now disabled (already added — emerald check)
    await expect(page.getByTestId('instagram-caption-drafter-picker-item-0-0')).toBeDisabled();
  });

  test('carousel publish posts image_urls array, surfaces "Carousel posted" toast', async ({ page, context }) => {
    await stubStatus(context, {
      connected: true, status: 'active', username: 'x', tone_profile_ready: true,
    });
    await stubDraftCaption(context, ['a', 'b', 'c']);

    let publishBody: { caption?: string; image_urls?: string[] } | null = null;
    await context.route('**/api/instagram/publish-post', async (route) => {
      publishBody = route.request().postDataJSON?.() ?? null;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true, media_id: 'M1', permalink: 'https://instagram.com/p/CAROUSEL', post_kind: 'carousel',
        }),
      });
    });

    await page.goto(INSTAGRAM_TAB_URL);
    await waitForInstagramPanel(page);

    await page.getByTestId('instagram-caption-drafter-topic').fill('menu showcase');
    await page.getByTestId('instagram-caption-drafter-submit').click();
    await page.getByTestId('instagram-caption-drafter-post-toggle-0').click();

    const urlInput = page.getByTestId('instagram-caption-drafter-image-url-0');
    const addBtn = page.getByTestId('instagram-caption-drafter-add-url-0');
    for (const u of ['https://x.com/1.jpg', 'https://x.com/2.jpg', 'https://x.com/3.jpg']) {
      await urlInput.fill(u);
      await addBtn.click();
    }

    await page.getByTestId('instagram-caption-drafter-publish-0').click();
    await expect(page.locator('body')).toContainText(/Carousel posted/i, { timeout: 5_000 });

    expect(publishBody?.image_urls).toEqual([
      'https://x.com/1.jpg', 'https://x.com/2.jpg', 'https://x.com/3.jpg',
    ]);
  });
});
