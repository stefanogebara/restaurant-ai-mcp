// Note: execSync is used here intentionally for ffmpeg CLI piping — no user input involved
import { execSync } from 'child_process'; // safe: all inputs are hardcoded constants
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const VO = resolve(ROOT, 'voiceovers/kinetic/kinetic-vo.mp3').replace(/\\/g, '/');
const OUT = resolve(ROOT, 'output');

const phrases = [
  ['This is', 0.0, 0.35, 52, '0x888888', -40],
  ['Seatable.', 0.3, 0.88, 96, 'white', 20],
  ["Your restaurants AI.", 0.89, 2.1, 72, 'white', 0],
  ['She answers', 2.4, 3.65, 56, '0x888888', -60],
  ['every call.', 2.9, 3.65, 84, 'white', 20],
  ['Every language.', 3.7, 4.38, 80, 'white', 0],
  ['Every hour.', 4.42, 5.15, 80, '0x9F1239', 0],
  ['Her name is', 5.36, 6.35, 44, '0x666666', -50],
  ['Sofia.', 5.7, 6.35, 120, '0x9F1239', 30],
  ['7 reservations tonight', 6.6, 7.95, 64, 'white', 0],
  ['27 guests expected', 8.25, 9.65, 64, 'white', 0],
  ['Zero missed calls.', 9.9, 10.95, 84, '0x9F1239', 0],
  ['WhatsApp.', 11.2, 12.57, 88, '0x25D366', 0],
  ['3 seconds.', 12.75, 13.75, 96, 'white', 0],
  ['While you sleep.', 13.99, 14.73, 72, '0x666666', 0],
  ['Analytics.', 14.88, 19.5, 64, 'white', -70],
  ['Revenue.', 15.78, 19.5, 64, 'white', 0],
  ['No-shows.', 17.07, 19.5, 64, '0x9F1239', 70],
  ['One dashboard.', 18.39, 19.5, 80, 'white', 0],
  ['5 minutes.', 19.78, 20.92, 96, 'white', 0],
  ['No credit card.', 21.04, 22.0, 40, '0x666666', -20],
  ['No technical knowledge.', 22.0, 23.0, 40, '0x666666', -20],
  ['Seatable.', 23.27, 28.5, 120, 'white', -60],
  ['Your AI host that never misses.', 24.06, 28.5, 36, '0x888888', 30],
  ['Try it free.', 26.0, 28.5, 32, '0x9F1239', 100],
  ['seatable.one', 27.0, 28.5, 26, '0x555555', 150],
];

const fontSerif = 'C\\\\:/Windows/Fonts/georgia.ttf';
const fontSans = 'C\\\\:/Windows/Fonts/arial.ttf';

const filters = phrases.map(([text, start, end, size, color, yOff]) => {
  // In filter_script files, no shell quoting needed — use escaping for special chars
  const escaped = String(text).replace(/'/g, '').replace(/:/g, '\\\\:').replace(/,/g, '\\\\,');
  const font = (size >= 64 ? fontSerif : fontSans).replace(/'/g, '');
  const fi = 0.06;
  const fo = 0.1;
  const endFade = Math.round((end - fo) * 100) / 100;
  const alpha = `if(lt(t-${start}\\,${fi})\\,(t-${start})/${fi}\\,if(gt(t\\,${endFade})\\,1-(t-${endFade})/${fo}\\,1))`;
  return `drawtext=text=${escaped}:fontfile=${font}:fontsize=${size}:fontcolor=${color}:x=(w-text_w)/2:y=(h-text_h)/2+${yOff}:enable=between(t\\,${start}\\,${end}):alpha=${alpha}`;
});

const filterStr = filters.join(',');
const videoOut = resolve(OUT, 'kinetic-video.mp4').replace(/\\/g, '/');
const finalOut = resolve(OUT, 'seatable-kinetic-reel.mp4').replace(/\\/g, '/');

console.log('Building kinetic typography Reel...');
console.log(`${phrases.length} phrases synced to voiceover\n`);

// Write filter to a file (command line too long for Windows)
import { writeFileSync } from 'fs';
const filterFile = resolve(OUT, 'kinetic-filter.txt').replace(/\\/g, '/');
writeFileSync(filterFile, filterStr);

execSync(`ffmpeg -y -f lavfi -i "color=c=0x0a0908:s=1080x1920:d=29:r=30" -filter_script:v "${filterFile}" -c:v libx264 -crf 18 -pix_fmt yuv420p -r 30 "${videoOut}"`, { stdio: 'pipe', maxBuffer: 50*1024*1024 });
console.log('Video rendered');

execSync(`ffmpeg -y -i "${videoOut}" -i "${VO}" -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart "${finalOut}"`, { stdio: 'pipe' });
console.log('Audio mixed');

console.log(`\nDONE -> output/seatable-kinetic-reel.mp4`);
