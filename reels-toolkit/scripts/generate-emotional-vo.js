import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const OUT = resolve(__dirname, '../voiceovers/emotional');
mkdirSync(OUT, { recursive: true });

function loadApiKey() {
  const env = readFileSync(resolve(ROOT, '.env.local'), 'utf-8').replace(/\r/g, '');
  return env.match(/ELEVENLABS_API_KEY=["']?([^"'\n]+)["']?/)[1].trim();
}

const VOICE_ID = 'VCgLBmBjldJmfphyB8sZ'; // Liam
const MODEL = 'eleven_multilingual_v2';

// THE EMOTIONAL SCRIPT
// Speaks to the restaurant owner's soul, not their feature list
const SCRIPT = `You didn't open a restaurant to answer phones.

You opened it for the moment a guest takes their first bite, closes their eyes, and smiles.

For the sound of a full room on a Friday night.

For the craft. The passion. The art of making people feel at home.

But somewhere between the missed calls and the empty tables, you forgot why you started.

What if you never missed another guest?

What if every call was answered, every table was filled, and every night felt like your best night?

Her name is Sofia.

She never sleeps. She never calls in sick. She speaks six languages.

And she exists for one reason: so you can go back to doing what you love.

Seatable.

Because restaurants should be about people, not phones.`;

async function main() {
  const apiKey = loadApiKey();
  console.log('Generating emotional voiceover...\n');
  console.log('--- SCRIPT ---');
  console.log(SCRIPT);
  console.log('--- END ---\n');

  // Generate main VO
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
    body: JSON.stringify({
      text: SCRIPT,
      model_id: MODEL,
      voice_settings: {
        stability: 0.55,         // More expressive
        similarity_boost: 0.70,
        style: 0.35,             // Emotional delivery
        use_speaker_boost: true,
      },
    }),
  });

  if (!res.ok) { console.error('Error:', await res.text()); return; }
  writeFileSync(resolve(OUT, 'emotional-vo.mp3'), Buffer.from(await res.arrayBuffer()));
  console.log('Saved: emotional-vo.mp3');

  // Get timestamps
  const tsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/with-timestamps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
    body: JSON.stringify({
      text: SCRIPT,
      model_id: MODEL,
      voice_settings: {
        stability: 0.55,
        similarity_boost: 0.70,
        style: 0.35,
        use_speaker_boost: true,
      },
    }),
  });

  if (tsRes.ok) {
    const tsData = await tsRes.json();
    if (tsData.alignment) {
      writeFileSync(resolve(OUT, 'timestamps.json'), JSON.stringify(tsData.alignment, null, 2));
      console.log('Saved: timestamps.json');
    }
    if (tsData.audio_base64) {
      writeFileSync(resolve(OUT, 'emotional-vo-ts.mp3'), Buffer.from(tsData.audio_base64, 'base64'));
      console.log('Saved: emotional-vo-ts.mp3');
    }
  }

  // Extract word timestamps
  if (tsRes.ok) {
    const ts = JSON.parse(readFileSync(resolve(OUT, 'timestamps.json'), 'utf-8'));
    const chars = ts.characters;
    const starts = ts.character_start_times_seconds;
    const ends = ts.character_end_times_seconds;

    let words = [];
    let cur = '';
    let wStart = 0;
    for (let i = 0; i < chars.length; i++) {
      if (chars[i] === ' ' || chars[i] === '\n') {
        if (cur.length > 0) {
          words.push({ word: cur, start: Math.round(wStart * 100) / 100, end: Math.round(ends[i-1] * 100) / 100 });
          cur = '';
        }
      } else {
        if (cur.length === 0) wStart = starts[i];
        cur += chars[i];
      }
    }
    if (cur.length > 0) words.push({ word: cur, start: Math.round(wStart * 100) / 100, end: Math.round(ends[chars.length-1] * 100) / 100 });

    writeFileSync(resolve(OUT, 'words.json'), JSON.stringify(words, null, 2));
    console.log('Saved: words.json (' + words.length + ' words)');
    console.log('\nTotal duration: ' + words[words.length-1].end + 's');
  }
}

main().catch(console.error);
