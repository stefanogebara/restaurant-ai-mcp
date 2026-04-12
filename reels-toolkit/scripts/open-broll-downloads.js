/**
 * Opens all Pexels B-roll video pages in your browser.
 * Click "Free Download" on each page and save to reels-toolkit/broll/
 *
 * Usage: node reels-toolkit/scripts/open-broll-downloads.js
 */

import { execFile } from 'child_process';

const clips = [
  { name: '01-wine-pour',       url: 'https://www.pexels.com/video/a-red-wine-poured-into-a-wine-glass-5666730/' },
  { name: '02-busy-restaurant',  url: 'https://www.pexels.com/video/people-eating-a-meal-at-the-restaurant-5101342/' },
  { name: '03-phone-notify',     url: 'https://www.pexels.com/video/notification-on-a-phone-7821643/' },
  { name: '04-kitchen-chefs',    url: 'https://www.pexels.com/video/a-group-of-chefs-busy-working-in-the-restaurant-kitchen-3768941/' },
  { name: '05-happy-couple',     url: 'https://www.pexels.com/video/couple-on-a-dinner-date-in-restaurant-5101337/' },
  { name: '06-food-overhead',    url: 'https://www.pexels.com/video/top-view-of-people-eating-their-food-4821100/' },
  { name: '07-waiter-serving',   url: 'https://www.pexels.com/video/footage-of-a-woman-serving-a-food-to-a-man-3760748/' },
  { name: '08-cocktail-flame',   url: 'https://www.pexels.com/video/a-person-burning-an-herb-on-a-cocktail-drink-5816532/' },
  { name: '09-phone-texting',    url: 'https://www.pexels.com/video/a-person-receiving-a-message-on-a-smartphone-7279035/' },
  { name: '10-chef-plating',     url: 'https://www.pexels.com/video/food-chef-kitchen-cooking-4253333/' },
];

console.log('\n\u{1F3AC} Opening Pexels B-roll pages in your browser');
console.log('   Click "Free Download" \u2192 select HD 1080p \u2192 save to reels-toolkit/broll/\n');

for (const clip of clips) {
  console.log(`   ${clip.name}: ${clip.url}`);
  execFile('cmd.exe', ['/c', 'start', '', clip.url]);
}

console.log('\n   Rename files after download:');
for (const clip of clips) {
  console.log(`   \u2192 ${clip.name}.mp4`);
}
