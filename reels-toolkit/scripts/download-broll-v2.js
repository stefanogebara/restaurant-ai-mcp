/**
 * Download Pexels B-roll videos — V2
 * Uses Playwright with visible browser + longer timeouts.
 * Extracts video src from the page and downloads via fetch.
 *
 * Usage: node reels-toolkit/scripts/download-broll-v2.js
 */

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, existsSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BROLL_DIR = resolve(__dirname, '../broll');
mkdirSync(BROLL_DIR, { recursive: true });

const CLIPS = [
  { name: '01-wine-pour',       id: '5666730' },
  { name: '02-busy-restaurant', id: '5101342' },
  { name: '03-phone-notify',    id: '7821643' },
  { name: '04-kitchen-chefs',   id: '3768941' },
  { name: '05-happy-couple',    id: '5101337' },
  { name: '06-food-overhead',   id: '4821100' },
  { name: '07-waiter-serving',  id: '3760748' },
  { name: '08-cocktail-flame',  id: '5816532' },
  { name: '09-phone-texting',   id: '7279035' },
  { name: '10-chef-plating',    id: '4253333' },
];

async function run() {
  console.log('🎬 Downloading Pexels B-roll clips (v2)\n');

  const browser = await chromium.launch({
    headless: false,
    args: ['--window-size=1280,800'],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();

  for (const clip of CLIPS) {
    const outPath = resolve(BROLL_DIR, `${clip.name}.mp4`);

    // Skip if already downloaded and > 100KB
    if (existsSync(outPath) && statSync(outPath).size > 100000) {
      console.log(`  ✅ ${clip.name} — already downloaded, skipping`);
      continue;
    }

    console.log(`  📹 ${clip.name}...`);

    try {
      // Use Pexels API-like endpoint to get video info
      const apiUrl = `https://www.pexels.com/video/${clip.id}/`;
      await page.goto(apiUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(3000);

      // Extract all video source URLs from the page
      const videoUrl = await page.evaluate(() => {
        // Method 1: video element
        const videoEl = document.querySelector('video');
        if (videoEl) {
          const source = videoEl.querySelector('source');
          if (source && source.src) return source.src;
          if (videoEl.src) return videoEl.src;
        }

        // Method 2: look in all script tags for video file URLs
        const scripts = document.querySelectorAll('script');
        for (const s of scripts) {
          const text = s.textContent || '';
          // Match Pexels CDN video URLs
          const match = text.match(/https:\/\/videos\.pexels\.com\/video-files\/\d+\/[^"'\s]+\.mp4/);
          if (match) return match[0];
        }

        // Method 3: check for download links
        const links = document.querySelectorAll('a[href*="video-files"], a[download]');
        for (const l of links) {
          if (l.href && l.href.includes('.mp4')) return l.href;
        }

        // Method 4: check page source for any mp4 URL
        const html = document.documentElement.innerHTML;
        const mp4Match = html.match(/https:\/\/[^"'\s]+\.mp4[^"'\s]*/);
        if (mp4Match) return mp4Match[0];

        return null;
      });

      if (!videoUrl) {
        console.log(`    ⚠️ No video URL found, trying download button...`);
        // Try clicking download button
        try {
          const dlBtn = page.locator('button:has-text("Free Download"), button:has-text("Download"), a:has-text("Download")').first();
          await dlBtn.click({ timeout: 5000 });
          await page.waitForTimeout(3000);

          // Check for download modal with quality options
          const hdLink = await page.evaluate(() => {
            const links = document.querySelectorAll('a[href*=".mp4"]');
            for (const l of links) {
              if (l.href.includes('1080') || l.href.includes('hd')) return l.href;
            }
            if (links.length > 0) return links[0].href;
            return null;
          });

          if (hdLink) {
            console.log(`    Source: ${hdLink.slice(0, 80)}...`);
            const res = await fetch(hdLink);
            const buf = Buffer.from(await res.arrayBuffer());
            writeFileSync(outPath, buf);
            console.log(`    ✅ Saved (${(buf.length / 1024 / 1024).toFixed(1)}MB)`);
          } else {
            console.log(`    ❌ Could not extract download URL`);
          }
        } catch (e2) {
          console.log(`    ❌ Download button failed: ${e2.message.slice(0, 60)}`);
        }
        continue;
      }

      console.log(`    Source: ${videoUrl.slice(0, 80)}...`);

      // Download using fetch
      const res = await fetch(videoUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Referer': 'https://www.pexels.com/',
        },
      });

      if (!res.ok) {
        console.log(`    ❌ HTTP ${res.status}`);
        continue;
      }

      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(outPath, buf);
      console.log(`    ✅ Saved (${(buf.length / 1024 / 1024).toFixed(1)}MB)`);

    } catch (e) {
      console.log(`    ❌ Error: ${e.message.slice(0, 80)}`);
    }
  }

  await browser.close();

  // Summary
  console.log('\n📁 Downloaded files:');
  for (const clip of CLIPS) {
    const p = resolve(BROLL_DIR, `${clip.name}.mp4`);
    if (existsSync(p)) {
      const size = statSync(p).size;
      const ok = size > 100000 ? '✅' : '⚠️ too small';
      console.log(`   ${ok} ${clip.name}.mp4 (${(size / 1024 / 1024).toFixed(1)}MB)`);
    } else {
      console.log(`   ❌ ${clip.name}.mp4 — missing`);
    }
  }
}

run().catch(console.error);
