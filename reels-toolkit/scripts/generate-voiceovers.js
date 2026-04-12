/**
 * Seatable Reels — ElevenLabs TTS Batch Voiceover Generator
 *
 * Generates all voiceover clips for 10 Reels in EN + PT-BR.
 * Uses your existing ELEVENLABS_API_KEY from .env.local
 *
 * Usage:
 *   node reels-toolkit/scripts/generate-voiceovers.js
 *   node reels-toolkit/scripts/generate-voiceovers.js --lang=pt
 *   node reels-toolkit/scripts/generate-voiceovers.js --reel=1
 *   node reels-toolkit/scripts/generate-voiceovers.js --reel=1 --lang=pt
 *
 * Output: reels-toolkit/voiceovers/en/ and reels-toolkit/voiceovers/pt/
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '../..');

// Load API key from .env.local
function loadApiKey() {
  const envPath = resolve(ROOT, '.env.local');
  if (!existsSync(envPath)) {
    console.error('ERROR: .env.local not found. Set ELEVENLABS_API_KEY.');
    process.exit(1);
  }
  const env = readFileSync(envPath, 'utf-8').replace(/\r/g, '');
  const match = env.match(/ELEVENLABS_API_KEY=["']?([^"'\n]+)["']?/);
  if (!match) {
    console.error('ERROR: ELEVENLABS_API_KEY not found in .env.local');
    process.exit(1);
  }
  return match[1].trim();
}

// Voice config
const VOICES = {
  en: {
    id: 'VCgLBmBjldJmfphyB8sZ', // Liam — lively, professional, great for SaaS demos
    name: 'Liam (EN)',
  },
  pt: {
    // Use a female PT-BR voice for warmth + hospitality alignment
    // Replace this ID with your preferred PT-BR voice from the shared library
    // Browse: https://elevenlabs.io/voice-library?language=pt-BR
    id: 'EXAVITQu4vr4xnSDxMaL', // Rachel (multilingual) — fallback, works well in PT-BR
    name: 'Rachel PT-BR',
  },
};

// TTS settings optimized for marketing narration
const VOICE_SETTINGS = {
  stability: 0.65,
  similarity_boost: 0.75,
  style: 0.25,
  use_speaker_boost: true,
};

const MODEL_ID = 'eleven_multilingual_v2'; // Supports EN + PT-BR natively

// ============================================================
// SCRIPTS — English
// ============================================================
const SCRIPTS_EN = [
  {
    reel: 1,
    title: 'The 2AM Booking',
    clips: [
      { id: 'hook', text: 'Last night at 2 AM, someone booked a table at your restaurant.' },
      { id: 'reveal', text: 'Your AI answered. Confirmed the table. Sent a confirmation.' },
      { id: 'demo', text: 'Sofia handles every call. Every language. Every hour.' },
      { id: 'impact', text: 'While you sleep, she fills your restaurant.' },
      { id: 'cta', text: 'Try Sofia free. Link in bio.' },
    ],
  },
  {
    reel: 2,
    title: 'The Missed Call',
    clips: [
      { id: 'hook', text: 'Your phone rang three times during dinner rush.' },
      { id: 'pain', text: 'Three guests. Three empty tables. Four hundred fifty dollars, gone.' },
      { id: 'solution', text: 'What if every call was answered? In three seconds. In any language.' },
      { id: 'proof', text: 'Zero missed calls. Every table filled.' },
      { id: 'cta', text: 'Seatable. Your AI host that never misses.' },
    ],
  },
  {
    reel: 3,
    title: 'Watch This',
    clips: [
      { id: 'intro', text: 'A guest calls. Sofia picks up.' },
      { id: 'result', text: 'Booked. Confirmed. Done.' },
      { id: 'cta', text: 'Two point three seconds. Try it free.' },
    ],
  },
  {
    reel: 4,
    title: 'WhatsApp Booking',
    clips: [
      { id: 'hook', text: 'A guest texts your restaurant on WhatsApp.' },
      { id: 'demo', text: 'Your AI responds instantly. Checks availability. Confirms the booking.' },
      { id: 'benefit', text: 'No app to download. No staff needed.' },
      { id: 'dashboard', text: 'It shows up on your dashboard. Automatically.' },
      { id: 'cta', text: 'WhatsApp bookings on autopilot.' },
    ],
  },
  {
    reel: 5,
    title: 'Before and After',
    clips: [
      { id: 'hook', text: 'Same restaurant. Two realities.' },
      { id: 'before1', text: 'Without AI, the phone rings. Nobody answers.' },
      { id: 'before2', text: 'Without AI, empty tables. With Seatable, every table filled.' },
      { id: 'before3', text: 'Without AI, checking voicemails at midnight. With Seatable, sleeping.' },
      { id: 'proof', text: 'One hundred percent of calls answered. Zero stress.' },
      { id: 'cta', text: 'Which reality do you want? Link in bio.' },
    ],
  },
  {
    reel: 6,
    title: 'Six Languages',
    clips: [
      { id: 'hook', text: 'Your AI speaks six languages.' },
      { id: 'proof', text: 'Every guest understood. Every booking confirmed.' },
      { id: 'cta', text: 'Seatable. Every language. Every call.' },
    ],
  },
  {
    reel: 7,
    title: 'The Founder Story',
    clips: [
      { id: 'intro', text: 'I spent six months building an AI employee for restaurants.' },
      { id: 'what', text: 'Not a chatbot. Not a widget. A full AI host that answers calls, books tables, and speaks six languages.' },
      { id: 'sofia', text: 'Her name is Sofia. She picks up in three seconds. She never calls in sick.' },
      { id: 'features', text: 'She remembers your regulars. She handles no-shows. She runs your front desk.' },
      { id: 'proof', text: 'Right now, she is running a restaurant in Sao Paulo. Handling calls in Portuguese at two in the morning.' },
      { id: 'stats', text: 'Forty-seven calls last week. Zero missed. Setup takes five minutes.' },
      { id: 'cta', text: 'Try her free. Link in bio.' },
    ],
  },
  {
    reel: 8,
    title: '5-Minute Setup',
    clips: [
      { id: 'hook', text: 'Five minutes. That is it.' },
      { id: 'step1', text: 'Enter your restaurant name. Your hours. Your tables.' },
      { id: 'step2', text: 'Choose your AI voice. Teach it your house rules.' },
      { id: 'step3', text: 'Done. Your AI is live. First booking, already coming in.' },
      { id: 'cta', text: 'Four minutes forty-seven seconds. No credit card needed.' },
    ],
  },
  {
    reel: 9,
    title: 'The Dashboard',
    clips: [
      { id: 'intro', text: 'This is your restaurant command center.' },
      { id: 'reservations', text: 'Every reservation. Real-time. No-show risk scored before they arrive.' },
      { id: 'floorplan', text: 'Your floor plan. Live. See who is seated, who is coming, who is late.' },
      { id: 'analytics', text: 'Your peak hours. Your trends. Your revenue, all in one view.' },
      { id: 'ai', text: 'Ask your AI manager anything. It knows your restaurant like you do.' },
      { id: 'always', text: 'And it never stops working.' },
      { id: 'cta', text: 'Seatable. See your restaurant clearly.' },
    ],
  },
  {
    reel: 10,
    title: 'No Signup Demo',
    clips: [
      { id: 'hook', text: 'No signup. No email. No credit card.' },
      { id: 'demo', text: 'Pick a restaurant. See it work. Right now.' },
      { id: 'cta', text: 'Link in bio. Thirty seconds.' },
    ],
  },
];

// ============================================================
// SCRIPTS — Brazilian Portuguese
// ============================================================
const SCRIPTS_PT = [
  {
    reel: 1,
    title: 'A Reserva das 2h',
    clips: [
      { id: 'hook', text: 'Ontem as duas da manha, alguem reservou uma mesa no seu restaurante.' },
      { id: 'reveal', text: 'Sua inteligencia artificial atendeu. Confirmou a mesa. Enviou a confirmacao.' },
      { id: 'demo', text: 'Sofia atende toda ligacao. Todo idioma. Toda hora.' },
      { id: 'impact', text: 'Enquanto voce dorme, ela enche seu restaurante.' },
      { id: 'cta', text: 'Experimente Sofia gratis. Link na bio.' },
    ],
  },
  {
    reel: 2,
    title: 'A Ligacao Perdida',
    clips: [
      { id: 'hook', text: 'Seu telefone tocou tres vezes durante o horario de pico.' },
      { id: 'pain', text: 'Tres clientes. Tres mesas vazias. Quatrocentos e cinquenta reais perdidos.' },
      { id: 'solution', text: 'E se toda ligacao fosse atendida? Em tres segundos. Em qualquer idioma.' },
      { id: 'proof', text: 'Zero ligacoes perdidas. Toda mesa ocupada.' },
      { id: 'cta', text: 'Seatable. Sua anfitria de inteligencia artificial que nunca falta.' },
    ],
  },
  {
    reel: 3,
    title: 'Olha Isso',
    clips: [
      { id: 'intro', text: 'Um cliente liga. Sofia atende.' },
      { id: 'result', text: 'Reservado. Confirmado. Pronto.' },
      { id: 'cta', text: 'Dois virgula tres segundos. Experimente gratis.' },
    ],
  },
  {
    reel: 4,
    title: 'Reserva pelo WhatsApp',
    clips: [
      { id: 'hook', text: 'Um cliente manda mensagem para seu restaurante no WhatsApp.' },
      { id: 'demo', text: 'Sua inteligencia artificial responde na hora. Verifica disponibilidade. Confirma a reserva.' },
      { id: 'benefit', text: 'Sem app para baixar. Sem funcionario necessario.' },
      { id: 'dashboard', text: 'Aparece no seu painel. Automaticamente.' },
      { id: 'cta', text: 'Reservas pelo WhatsApp no piloto automatico.' },
    ],
  },
  {
    reel: 5,
    title: 'Antes e Depois',
    clips: [
      { id: 'hook', text: 'Mesmo restaurante. Duas realidades.' },
      { id: 'before1', text: 'Sem inteligencia artificial, o telefone toca. Ninguem atende.' },
      { id: 'before2', text: 'Sem inteligencia artificial, mesas vazias. Com Seatable, toda mesa ocupada.' },
      { id: 'before3', text: 'Sem inteligencia artificial, ouvindo recados a meia-noite. Com Seatable, dormindo.' },
      { id: 'proof', text: 'Cem por cento das ligacoes atendidas. Zero estresse.' },
      { id: 'cta', text: 'Qual realidade voce quer? Link na bio.' },
    ],
  },
  {
    reel: 6,
    title: 'Seis Idiomas',
    clips: [
      { id: 'hook', text: 'Sua inteligencia artificial fala seis idiomas.' },
      { id: 'proof', text: 'Todo cliente entendido. Toda reserva confirmada.' },
      { id: 'cta', text: 'Seatable. Todo idioma. Toda ligacao.' },
    ],
  },
  {
    reel: 7,
    title: 'A Historia do Fundador',
    clips: [
      { id: 'intro', text: 'Passei seis meses construindo uma funcionaria de inteligencia artificial para restaurantes.' },
      { id: 'what', text: 'Nao e um chatbot. Nao e um widget. E uma anfitria completa que atende ligacoes, reserva mesas e fala seis idiomas.' },
      { id: 'sofia', text: 'O nome dela e Sofia. Ela atende em tres segundos. Ela nunca falta ao trabalho.' },
      { id: 'features', text: 'Ela lembra dos seus clientes fieis. Ela lida com no-shows. Ela cuida da sua recepcao.' },
      { id: 'proof', text: 'Agora mesmo, ela esta gerenciando um restaurante em Sao Paulo. Atendendo ligacoes em portugues as duas da manha.' },
      { id: 'stats', text: 'Quarenta e sete ligacoes na semana passada. Zero perdidas. Configuracao leva cinco minutos.' },
      { id: 'cta', text: 'Experimente gratis. Link na bio.' },
    ],
  },
  {
    reel: 8,
    title: 'Configuracao em 5 Minutos',
    clips: [
      { id: 'hook', text: 'Cinco minutos. So isso.' },
      { id: 'step1', text: 'Coloque o nome do seu restaurante. Seus horarios. Suas mesas.' },
      { id: 'step2', text: 'Escolha a voz da sua inteligencia artificial. Ensine as regras da casa.' },
      { id: 'step3', text: 'Pronto. Sua inteligencia artificial esta no ar. Primeira reserva ja chegando.' },
      { id: 'cta', text: 'Quatro minutos e quarenta e sete segundos. Sem cartao de credito.' },
    ],
  },
  {
    reel: 9,
    title: 'O Painel',
    clips: [
      { id: 'intro', text: 'Este e o centro de comando do seu restaurante.' },
      { id: 'reservations', text: 'Todas as reservas. Em tempo real. Risco de no-show avaliado antes de chegarem.' },
      { id: 'floorplan', text: 'Sua planta. Ao vivo. Veja quem esta sentado, quem esta chegando, quem esta atrasado.' },
      { id: 'analytics', text: 'Seus horarios de pico. Suas tendencias. Sua receita, tudo em uma tela.' },
      { id: 'ai', text: 'Pergunte qualquer coisa ao seu gerente de inteligencia artificial. Ele conhece seu restaurante como voce.' },
      { id: 'always', text: 'E nunca para de trabalhar.' },
      { id: 'cta', text: 'Seatable. Veja seu restaurante com clareza.' },
    ],
  },
  {
    reel: 10,
    title: 'Demo Sem Cadastro',
    clips: [
      { id: 'hook', text: 'Sem cadastro. Sem email. Sem cartao de credito.' },
      { id: 'demo', text: 'Escolha um restaurante. Veja funcionando. Agora mesmo.' },
      { id: 'cta', text: 'Link na bio. Trinta segundos.' },
    ],
  },
];

// ============================================================
// TTS Generation
// ============================================================
async function generateClip(apiKey, voiceId, text, outputPath) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text,
      model_id: MODEL_ID,
      voice_settings: VOICE_SETTINGS,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs API error (${response.status}): ${error}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  writeFileSync(outputPath, buffer);
  return buffer.length;
}

async function main() {
  const apiKey = loadApiKey();
  const args = process.argv.slice(2);

  // Parse args
  let filterLang = null;
  let filterReel = null;
  for (const arg of args) {
    if (arg.startsWith('--lang=')) filterLang = arg.split('=')[1];
    if (arg.startsWith('--reel=')) filterReel = parseInt(arg.split('=')[1]);
  }

  const languages = filterLang ? [filterLang] : ['en', 'pt'];

  for (const lang of languages) {
    const scripts = lang === 'en' ? SCRIPTS_EN : SCRIPTS_PT;
    const voice = VOICES[lang];
    const outDir = resolve(__dirname, `../voiceovers/${lang}`);
    mkdirSync(outDir, { recursive: true });

    console.log(`\n=== Generating ${lang.toUpperCase()} voiceovers with ${voice.name} ===\n`);

    for (const reel of scripts) {
      if (filterReel && reel.reel !== filterReel) continue;

      console.log(`  Reel ${reel.reel}: ${reel.title}`);

      for (const clip of reel.clips) {
        const filename = `reel-${String(reel.reel).padStart(2, '0')}-${clip.id}.mp3`;
        const outputPath = resolve(outDir, filename);

        if (existsSync(outputPath)) {
          console.log(`    [SKIP] ${filename} (already exists)`);
          continue;
        }

        try {
          const size = await generateClip(apiKey, voice.id, clip.text, outputPath);
          console.log(`    [OK]   ${filename} (${(size / 1024).toFixed(1)}KB)`);
          // Rate limit: 2 requests/second to stay safe
          await new Promise(r => setTimeout(r, 600));
        } catch (err) {
          console.error(`    [FAIL] ${filename}: ${err.message}`);
        }
      }
    }
  }

  console.log('\n=== Done! ===');
  console.log('Voiceovers saved to: reels-toolkit/voiceovers/en/ and reels-toolkit/voiceovers/pt/');
  console.log('\nNext steps:');
  console.log('1. Run clips through Adobe Podcast Enhance: https://podcast.adobe.com/enhance');
  console.log('2. Import into CapCut and sync with screen recordings');
  console.log('3. Set voiceover as primary audio, background music at 15% volume');
}

main().catch(console.error);
