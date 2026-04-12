/**
 * Generate a single continuous voiceover for the kinetic typography Reel.
 * Script is designed for word-on-screen format — short punchy phrases.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const OUT = resolve(__dirname, '../voiceovers/kinetic');
mkdirSync(OUT, { recursive: true });

function loadApiKey() {
  const env = readFileSync(resolve(ROOT, '.env.local'), 'utf-8').replace(/\r/g, '');
  return env.match(/ELEVENLABS_API_KEY=["']?([^"'\n]+)["']?/)[1].trim();
}

const VOICE_ID = 'VCgLBmBjldJmfphyB8sZ'; // Liam
const MODEL = 'eleven_multilingual_v2';

const SCRIPT = `This is Seatable.

Your restaurant's AI.

She answers every call. Every language. Every hour.

Her name is Sofia.

Seven reservations tonight. Twenty-seven guests expected. Zero missed calls.

She books tables on WhatsApp. In three seconds. While you sleep.

Analytics. Revenue forecasts. No-show predictions. All in one dashboard.

Setup takes five minutes. No credit card. No technical knowledge.

Seatable. Your AI host that never misses.

Try it free. seatable dot one.`;

async function main() {
  const apiKey = loadApiKey();
  console.log('🎙️ Generating kinetic typography voiceover...\n');
  console.log('Script:');
  console.log(SCRIPT);
  console.log('\n');

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
    body: JSON.stringify({
      text: SCRIPT,
      model_id: MODEL,
      voice_settings: {
        stability: 0.60,        // Slightly more expressive for this format
        similarity_boost: 0.75,
        style: 0.30,            // More style for dramatic delivery
        use_speaker_boost: true,
      },
    }),
  });

  if (!res.ok) { console.error('Error:', await res.text()); return; }

  const buf = Buffer.from(await res.arrayBuffer());
  const path = resolve(OUT, 'kinetic-vo.mp3');
  writeFileSync(path, buf);
  console.log(`✅ Saved: voiceovers/kinetic/kinetic-vo.mp3 (${(buf.length/1024).toFixed(0)}KB)`);

  // Also generate with timestamps for word sync
  const tsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/with-timestamps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
    body: JSON.stringify({
      text: SCRIPT,
      model_id: MODEL,
      voice_settings: {
        stability: 0.60,
        similarity_boost: 0.75,
        style: 0.30,
        use_speaker_boost: true,
      },
    }),
  });

  if (tsRes.ok) {
    const tsData = await tsRes.json();
    if (tsData.alignment) {
      writeFileSync(resolve(OUT, 'timestamps.json'), JSON.stringify(tsData.alignment, null, 2));
      console.log('✅ Saved: voiceovers/kinetic/timestamps.json (word timing data)');
    }
    if (tsData.audio_base64) {
      writeFileSync(resolve(OUT, 'kinetic-vo-ts.mp3'), Buffer.from(tsData.audio_base64, 'base64'));
      console.log('✅ Saved: voiceovers/kinetic/kinetic-vo-ts.mp3 (timestamped version)');
    }
  } else {
    console.log('⚠️ Timestamp API not available, will use manual timing');
  }
}

main().catch(console.error);
