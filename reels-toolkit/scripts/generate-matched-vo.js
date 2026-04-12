/**
 * Generate voiceover clips that match what's ACTUALLY shown in the scene recordings.
 * Each clip describes exactly what the viewer sees on screen.
 */

import { readFileSync } from 'fs';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const VO_DIR = resolve(__dirname, '../voiceovers/matched');
mkdirSync(VO_DIR, { recursive: true });

function loadApiKey() {
  const env = readFileSync(resolve(ROOT, '.env.local'), 'utf-8').replace(/\r/g, '');
  const match = env.match(/ELEVENLABS_API_KEY=["']?([^"'\n]+)["']?/);
  return match[1].trim();
}

const VOICE_ID = 'VCgLBmBjldJmfphyB8sZ'; // Liam
const MODEL = 'eleven_multilingual_v2';
const SETTINGS = { stability: 0.65, similarity_boost: 0.75, style: 0.25, use_speaker_boost: true };

// VO clips matched to scene content
const CLIPS = [
  // Scene A: Dashboard (use from ~8s to ~25s of recording)
  { id: 'dash-intro', text: 'Seven reservations. Twenty-seven guests expected. Your restaurant is fully booked tonight.' },
  { id: 'dash-names', text: 'Joao Silva, party of two. Ana Paula Costa, party of six. Carlos Mendes, party of three. All confirmed. All managed by your AI.' },
  { id: 'dash-tables', text: 'Four tables. Live floor plan. Every seat accounted for.' },

  // Scene B: Voice settings (from ~8s to ~25s)
  { id: 'voice-engine', text: 'ElevenLabs voice engine. Premium quality. Multilingual support.' },
  { id: 'voice-sofia', text: 'Her name is Sofia. She speaks six languages. She answers every call in three seconds.' },

  // Scene C: Analytics (from ~8s to ~28s)
  { id: 'analytics-intro', text: 'Real-time analytics. Reservation trends. Peak hour heatmaps.' },
  { id: 'analytics-revenue', text: 'Revenue opportunities identified automatically. Table turnover optimization. No-show risk prediction.' },

  // Scene D: Booking page (from ~5s to ~18s)
  { id: 'booking-flow', text: 'Your customers book in thirty seconds. Pick a date, choose a table, confirm. Done.' },

  // Transitions / CTA
  { id: 'opening', text: 'This is what running a restaurant looks like in twenty twenty-six.' },
  { id: 'cta', text: 'Seatable. Try it free. Link in bio.' },
];

async function generate(apiKey, text, outPath) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
    body: JSON.stringify({ text, model_id: MODEL, voice_settings: SETTINGS }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  writeFileSync(outPath, Buffer.from(await res.arrayBuffer()));
}

async function main() {
  const apiKey = loadApiKey();
  console.log('🎙️ Generating matched voiceover clips\n');

  for (const clip of CLIPS) {
    const path = resolve(VO_DIR, `${clip.id}.mp3`);
    if (existsSync(path)) { console.log(`  [SKIP] ${clip.id}`); continue; }
    try {
      await generate(apiKey, clip.text, path);
      console.log(`  ✅ ${clip.id}.mp3`);
      await new Promise(r => setTimeout(r, 600));
    } catch (e) {
      console.log(`  ❌ ${clip.id}: ${e.message.slice(0, 80)}`);
    }
  }
  console.log('\n✅ Done! Check voiceovers/matched/');
}

main().catch(console.error);
