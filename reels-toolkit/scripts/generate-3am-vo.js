import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const OUT = resolve(__dirname, '../voiceovers/3am');
mkdirSync(OUT, { recursive: true });

function loadApiKey() {
  const env = readFileSync(resolve(ROOT, '.env.local'), 'utf-8').replace(/\r/g, '');
  return env.match(/ELEVENLABS_API_KEY=["']?([^"'\n]+)["']?/)[1].trim();
}

const VOICE_ID = 'VCgLBmBjldJmfphyB8sZ';
const MODEL = 'eleven_multilingual_v2';

const SCRIPT = `3 AM. You're sleeping. Your AI isn't.

She just booked a table for Saturday night. Confirmed it on WhatsApp. Updated your dashboard.

You'll see it when you wake up.

That's Seatable.

Try it free.`;

async function main() {
  const apiKey = loadApiKey();
  console.log('Generating 3AM voiceover...\n');

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/with-timestamps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
    body: JSON.stringify({
      text: SCRIPT,
      model_id: MODEL,
      voice_settings: {
        stability: 0.50,
        similarity_boost: 0.70,
        style: 0.35,
        use_speaker_boost: true,
      },
    }),
  });

  if (!res.ok) { console.error(await res.text()); return; }
  const data = await res.json();

  if (data.audio_base64) {
    writeFileSync(resolve(OUT, 'vo.mp3'), Buffer.from(data.audio_base64, 'base64'));
    console.log('Saved vo.mp3');
  }

  if (data.alignment) {
    const chars = data.alignment.characters;
    const starts = data.alignment.character_start_times_seconds;
    const ends = data.alignment.character_end_times_seconds;

    let words = [];
    let cur = '';
    let wStart = 0;
    for (let i = 0; i < chars.length; i++) {
      if (chars[i] === ' ' || chars[i] === '\n') {
        if (cur.length > 0) {
          words.push({ w: cur, s: Math.round(wStart * 100) / 100, e: Math.round(ends[i-1] * 100) / 100 });
          cur = '';
        }
      } else {
        if (cur.length === 0) wStart = starts[i];
        cur += chars[i];
      }
    }
    if (cur.length > 0) words.push({ w: cur, s: Math.round(wStart * 100) / 100, e: Math.round(ends[chars.length-1] * 100) / 100 });

    writeFileSync(resolve(OUT, 'words.json'), JSON.stringify(words, null, 2));
    console.log(`Saved words.json (${words.length} words)`);
    console.log(`Duration: ${words[words.length-1].e}s\n`);

    // Print word timings
    for (const w of words) {
      console.log(`  ${w.s.toFixed(2)} - ${w.e.toFixed(2)} : ${w.w}`);
    }
  }
}

main().catch(console.error);
