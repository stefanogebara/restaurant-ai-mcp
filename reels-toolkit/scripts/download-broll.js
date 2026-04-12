/**
 * Download Pexels B-roll videos using Playwright
 * Navigates to each Pexels page, extracts the video source URL, downloads it.
 *
 * Usage: node reels-toolkit/scripts/download-broll.js
 */

import { chromium } from 'playwright';
import { mkdirSync, createWriteStream } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BROLL_DIR = resolve(__dirname, '../broll');
mkdirSync(BROLL_DIR, { recursive: true });

const CLIPS = [
  { name: 'wine-pour', url: 'https://www.pexels.com/video/a-red-wine-poured-into-a-wine-glass-5666730/' },
  { name: 'busy-restaurant', url: 'https://www.pexels.com/video/people-eating-a-meal-at-the-restaurant-5101342/' },
  { name: 'phone-notification', url: 'https://www.pexels.com/video/notification-on-a-phone-7821643/' },
  { name: 'kitchen-chefs', url: 'https://www.pexels.com/video/a-group-of-chefs-busy-working-in-the-restaurant-kitchen-3768941/' },
  { name: 'happy-couple', url: 'https://www.pexels.com/video/couple-on-a-dinner-date-in-restaurant-5101337/' },
  { name: 'food-overhead', url: 'https://www.pexels.com/video/top-view-of-people-eating-their-food-4821100/' },
  { name: 'waiter-serving', url: 'https://www.pexels.com/video/footage-of-a-woman-serving-a-food-to-a-man-3760748/' },
  { name: 'cocktail-flame', url: 'https://www.pexels.com/video/a-person-burning-an-herb-on-a-cocktail-drink-5816532/' },
];

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const file = createWriteStream(dest);
    mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.pexels.com/' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', reject);
  });
}

async function run() {
  console.log('🎬 Downloading Pexels B-roll clips...\n');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  for (const clip of CLIPS) {
    const outPath = resolve(BROLL_DIR, `${clip.name}.mp4`);
    console.log(`  📹 ${clip.name}...`);

    try {
      await page.goto(clip.url, { waitUntil: 'networkidle', timeout: 30000 });

      // Extract video source URL from the page
      const videoUrl = await page.evaluate(() => {
        // Try finding video element source
        const video = document.querySelector('video source');
        if (video) return video.src;

        // Try finding download link
        const dl = document.querySelector('a[href*="video-files"]');
        if (dl) return dl.href;

        // Try meta tag
        const meta = document.querySelector('meta[property="og:video"]');
        if (meta) return meta.content;

        // Try finding in JSON-LD
        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (const s of scripts) {
          try {
            const data = JSON.parse(s.textContent);
            if (data.contentUrl) return data.contentUrl;
          } catch (e) {}
        }

        return null;
      });

      if (videoUrl) {
        console.log(`    Source: ${videoUrl.slice(0, 80)}...`);
        await downloadFile(videoUrl, outPath);
        console.log(`    ✅ Saved`);
      } else {
        console.log(`    ❌ Could not find video URL`);
      }
    } catch (e) {
      console.log(`    ❌ Error: ${e.message.slice(0, 80)}`);
    }
  }

  await browser.close();
  console.log('\n✅ Done! Check reels-toolkit/broll/');
}

run().catch(console.error);
