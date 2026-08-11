'use strict';

/**
 * WhatsApp management-plane helpers for the prospecting number: identity
 * (display name status, quality), template lifecycle (list/create on the WABA)
 * and business-profile updates (photo, about, websites).
 *
 * Uses the SAME WHATSAPP_ACCESS_TOKEN the send path uses — these run in
 * production functions where that token is valid, so the ops console can
 * manage identity/templates without anyone handling raw tokens locally.
 * Template creation submits straight to Meta review; approval status is
 * read back live from the WABA (never cached in our DB).
 */

const { createSecureLogger } = require('../secure-logger');

const logger = createSecureLogger('WaManagement');

const GRAPH = 'https://graph.facebook.com/v21.0';

/** Prospecting WABA (WhatsApp Business Account) that owns the templates. */
function wabaId() {
  return process.env.PROSPECTING_WABA_ID || '25687973367501862';
}

function token() {
  return process.env.WHATSAPP_ACCESS_TOKEN || '';
}

async function graphGet(path) {
  const res = await fetch(`${GRAPH}/${path}`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || 'Graph error');
  return json;
}

async function graphPost(path, body, headers = {}) {
  const res = await fetch(`${GRAPH}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || 'Graph error');
  return json;
}

/**
 * Number identity + business profile, merged for the console.
 * @param {string} phoneNumberId
 */
async function getNumberIdentity(phoneNumberId) {
  const [number, profile] = await Promise.all([
    graphGet(`${phoneNumberId}?fields=verified_name,name_status,display_phone_number,quality_rating`),
    graphGet(`${phoneNumberId}/whatsapp_business_profile?fields=about,description,profile_picture_url,websites,email`)
      .then((r) => (Array.isArray(r.data) && r.data[0]) || {})
      .catch(() => ({})),
  ]);
  return {
    display_phone_number: number.display_phone_number || null,
    verified_name: number.verified_name || null,
    name_status: number.name_status || null,       // APPROVED | PENDING_REVIEW | DECLINED | ...
    quality_rating: number.quality_rating || null, // GREEN | YELLOW | RED | UNKNOWN
    profile: {
      about: profile.about || null,
      description: profile.description || null,
      profile_picture_url: profile.profile_picture_url || null,
      websites: profile.websites || [],
      email: profile.email || null,
    },
  };
}

/** Templates as Meta sees them (name, language, review status, body). */
async function listMetaTemplates() {
  const json = await graphGet(`${wabaId()}/message_templates?fields=name,status,language,components,quality_score&limit=100`);
  return (json.data || []).map((t) => {
    const body = (t.components || []).find((c) => c.type === 'BODY');
    const buttons = (t.components || []).find((c) => c.type === 'BUTTONS');
    return {
      name: t.name,
      language: t.language,
      status: t.status,               // APPROVED | PENDING | REJECTED | ...
      quality: (t.quality_score && t.quality_score.score) || null,
      body_text: body ? body.text : null,
      has_url_button: !!(buttons && (buttons.buttons || []).some((b) => b.type === 'URL')),
    };
  });
}

/**
 * Build the Graph payload for a marketing template (pure — unit tested).
 *
 * Handles {{1}}..{{n}} (Meta requires one example per variable, in order) and
 * both quick-reply and URL buttons in a single BUTTONS component.
 *
 * The multi-variable / quick-reply support was added on 11/08/2026 for the
 * founder templates. Until then this only expressed one variable and one link
 * button, so the only way to submit those was Meta's own UI — which is where
 * they got created under the wrong WhatsApp Business Account. A tool that can't
 * express the real case pushes whoever uses it onto the unverified path.
 *
 * @param {string|string[]} exampleParam  legacy single example
 * @param {string[]} exampleParams        one example per {{n}}, in order
 * @param {string[]} quickReplies         up to 3 quick-reply button labels
 */
function buildTemplatePayload({
  name, language = 'pt_BR', category = 'MARKETING', bodyText,
  exampleParam, exampleParams, buttonText, buttonUrl, quickReplies,
}) {
  const cleanName = String(name || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const text = String(bodyText || '').trim();
  if (!cleanName || !text) return { ok: false, error: 'name and bodyText required' };
  if (text.length > 1024) return { ok: false, error: 'bodyText over 1024 chars' };

  // Highest {{n}} present, and whether the sequence has holes. Meta substitutes
  // by position, so {{2}} without {{1}} silently shifts every value.
  const indices = [...text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  const maior = indices.length ? Math.max(...indices) : 0;
  for (let i = 1; i <= maior; i += 1) {
    if (!indices.includes(i)) {
      return { ok: false, error: `variáveis fora de sequência: falta {{${i}}} (o corpo usa até {{${maior}}})` };
    }
  }

  const body = { type: 'BODY', text };
  if (maior > 0) {
    const fornecidos = Array.isArray(exampleParams) ? exampleParams
      : (exampleParam != null ? [exampleParam] : []);
    // One variable keeps the old forgiving default; more than one must be
    // spelled out, because there is no honest guess for a second value.
    const exemplos = (maior === 1 && fornecidos.length === 0)
      ? ['Cantina Bella'] : fornecidos;
    if (exemplos.length !== maior) {
      return { ok: false, error: `o corpo usa ${maior} variáveis, então precisa de ${maior} exemplos (recebi ${exemplos.length})` };
    }
    body.example = { body_text: [exemplos.map(String)] };
  }

  const components = [body];

  // A SINGLE BUTTONS component — Meta rejects two blocks.
  const buttons = [];
  if (Array.isArray(quickReplies) && quickReplies.length) {
    if (quickReplies.length > 3) return { ok: false, error: 'no máximo 3 botões de resposta rápida' };
    for (const label of quickReplies) {
      const texto = String(label || '').trim().slice(0, 25);
      if (!texto) return { ok: false, error: 'botão de resposta rápida sem texto' };
      buttons.push({ type: 'QUICK_REPLY', text: texto });
    }
  }
  if (buttonUrl) {
    if (!/^https:\/\//.test(String(buttonUrl))) return { ok: false, error: 'buttonUrl must be https' };
    buttons.push({ type: 'URL', text: String(buttonText || 'Conhecer a Seatable').slice(0, 25), url: String(buttonUrl) });
  }
  if (buttons.length) components.push({ type: 'BUTTONS', buttons });

  return {
    ok: true,
    payload: {
      name: cleanName,
      language: String(language),
      category: ['MARKETING', 'UTILITY'].includes(String(category).toUpperCase())
        ? String(category).toUpperCase() : 'MARKETING',
      components,
    },
  };
}

/** Create a template on the WABA — submits directly to Meta review. */
async function createMetaTemplate(input) {
  const built = buildTemplatePayload(input);
  if (!built.ok) return built;
  try {
    const json = await graphPost(`${wabaId()}/message_templates`, built.payload);
    logger.info(`template created name=${built.payload.name} id=${json.id} status=${json.status || 'PENDING'}`);
    return { ok: true, id: json.id, status: json.status || 'PENDING', name: built.payload.name };
  } catch (err) {
    logger.error('createMetaTemplate failed:', err.message);
    return { ok: false, error: err.message };
  }
}

/** Resolve the app id for the Resumable Upload API (env → token introspection). */
async function resolveAppId() {
  if (process.env.WHATSAPP_APP_ID) return process.env.WHATSAPP_APP_ID;
  const json = await graphGet('app?fields=id');
  return json.id;
}

/**
 * Set the number's profile picture from a public image URL:
 * download → resumable upload (handle) → whatsapp_business_profile.
 */
async function setProfilePicture(phoneNumberId, imageUrl) {
  try {
    const img = await fetch(String(imageUrl));
    if (!img.ok) return { ok: false, error: `image fetch failed (${img.status})` };
    const contentType = img.headers.get('content-type') || 'image/jpeg';
    if (!/^image\/(jpeg|png)/.test(contentType)) {
      return { ok: false, error: `unsupported image type ${contentType} (jpeg/png only)` };
    }
    const bytes = Buffer.from(await img.arrayBuffer());
    if (bytes.length > 5 * 1024 * 1024) return { ok: false, error: 'image over 5MB' };

    const appId = await resolveAppId();
    const session = await graphPost(
      `${appId}/uploads?file_length=${bytes.length}&file_type=${encodeURIComponent(contentType)}`, {});
    const sessionId = session.id; // "upload:..."

    const up = await fetch(`${GRAPH}/${sessionId}`, {
      method: 'POST',
      headers: {
        Authorization: `OAuth ${token()}`,
        file_offset: '0',
        'Content-Type': 'application/octet-stream',
      },
      body: bytes,
    });
    const upJson = await up.json();
    if (!upJson.h) return { ok: false, error: `upload failed: ${JSON.stringify(upJson.error || upJson)}` };

    await graphPost(`${phoneNumberId}/whatsapp_business_profile`, {
      messaging_product: 'whatsapp',
      profile_picture_handle: upJson.h,
    });
    logger.info('profile picture updated');
    return { ok: true };
  } catch (err) {
    logger.error('setProfilePicture failed:', err.message);
    return { ok: false, error: err.message };
  }
}

/** Update text fields of the business profile (about/description/websites/email). */
async function updateBusinessProfile(phoneNumberId, { about, description, websites, email }) {
  const body = { messaging_product: 'whatsapp' };
  if (about != null) body.about = String(about).slice(0, 139);
  if (description != null) body.description = String(description).slice(0, 512);
  if (email != null) body.email = String(email).slice(0, 128);
  if (Array.isArray(websites) && websites.length) body.websites = websites.slice(0, 2).map(String);
  if (Object.keys(body).length === 1) return { ok: false, error: 'nothing to update' };
  try {
    await graphPost(`${phoneNumberId}/whatsapp_business_profile`, body);
    return { ok: true };
  } catch (err) {
    logger.error('updateBusinessProfile failed:', err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = {
  getNumberIdentity, listMetaTemplates, createMetaTemplate, buildTemplatePayload,
  setProfilePicture, updateBusinessProfile, wabaId,
};
