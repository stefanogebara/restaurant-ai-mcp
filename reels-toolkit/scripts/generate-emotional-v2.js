import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const OUT = resolve(__dirname, '../voiceovers/emotional-v2');
mkdirSync(OUT, { recursive: true });

function loadApiKey() {
  const env = readFileSync(resolve(ROOT, '.env.local'), 'utf-8').replace(/\r/g, '');
  return env.match(/ELEVENLABS_API_KEY=["']?([^"'\n]+)["']?/)[1].trim();
}

const VOICE_ID = 'VCgLBmBjldJmfphyB8sZ';
const MODEL = 'eleven_multilingual_v2';

const SCRIPT = `You didn't open a restaurant to answer phones.

You opened it for that moment... when a guest takes their first bite... closes their eyes... and smiles.

For the sound of a full room on a Friday night.

The craft... the passion... the art of making people feel at home.

But somewhere between the missed calls... and the empty tables... you lost sight of why you started.

What if you never missed another guest?

What if every call was answered... every table was filled... and every night felt like your best night?

She never sleeps. She never calls in sick. She speaks your guests' language.

And she exists for one reason... so you can go back to doing what you love.

Seatable.

Because restaurants should be about people... not phones.

Try it free.`;

async function main() {
  const apiKey = loadApiKey();
  console.log('Generating emotional v2 voiceover...\n');

  // Generate with timestamps
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/with-timestamps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
    body: JSON.stringify({
      text: SCRIPT,
      model_id: MODEL,
      voice_settings: {
        stability: 0.50,
        similarity_boost: 0.65,
        style: 0.40,
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

    // Extract words
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
    console.log(`Duration: ${words[words.length-1].e}s`);

    // Map key phrases (only the ones we want to show on screen)
    const phrases = [
      'answer phones',
      'first bite',
      'closes their eyes',
      'smiles',
      'full room',
      'Friday night',
      'the craft',
      'the passion',
      'feel at home',
      'missed calls',
      'empty tables',
      'why you started',
      'never missed another guest',
      'every call',
      'every table',
      'your best night',
      'never sleeps',
      'never calls in sick',
      'your guests',
      'what you love',
      'Seatable',
      'people',
      'not phones',
      'Try it free',
    ];

    // Find timing for each phrase
    const phraseTimings = [];
    for (const phrase of phrases) {
      const phraseWords = phrase.toLowerCase().split(' ');
      for (let i = 0; i <= words.length - phraseWords.length; i++) {
        const match = phraseWords.every((pw, j) =>
          words[i + j].w.toLowerCase().replace(/[.,!?;:]/g, '') === pw.replace(/[.,!?;:]/g, '')
        );
        if (match) {
          phraseTimings.push({
            text: phrase,
            start: words[i].s,
            end: words[i + phraseWords.length - 1].e,
          });
          break;
        }
      }
    }

    writeFileSync(resolve(OUT, 'phrases.json'), JSON.stringify(phraseTimings, null, 2));
    console.log(`\nPhrase timings:`);
    for (const p of phraseTimings) {
      console.log(`  ${p.start.toFixed(2)}s - ${p.end.toFixed(2)}s : "${p.text}"`);
    }
  }
}

main().catch(console.error);
