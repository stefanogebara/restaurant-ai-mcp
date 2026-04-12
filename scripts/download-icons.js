/**
 * Download all 3D icons from thiings.co and resize them
 * Run: node scripts/download-icons.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const CDN_BASE = 'https://lftz25oez4aqbxpq.public.blob.vercel-storage.com/image-';
const ICONS_DIR = path.join(__dirname, '..', 'client', 'public', 'icons', '3d');

// Final curated icon mapping: ourName -> thiings fileId
const ICONS = {
  // Navigation
  'arrow-right': 'N2VKG116RCdDw9OKcmRO31lthC6Qfs', // stock-trading-arrow (green up-right)
  'arrow-left': 'AbvH02C2XqrfmyICpipznmKPdgtcc1', // backpack (fallback - will use arrow-down rotated)
  'arrow-down': 'FOE3QN3dHe4jy1Xql7qDr4W9BhVFFb', // arrow-down
  'chevron-down': 'FOE3QN3dHe4jy1Xql7qDr4W9BhVFFb', // arrow-down (closest)
  'chevron-up': 'YHtpOpuD12sCS0M3Usudx7zVUwG5fS', // up-arrow
  'chevron-left': 'AbvH02C2XqrfmyICpipznmKPdgtcc1', // use arrow-left
  'chevron-right': 'N2VKG116RCdDw9OKcmRO31lthC6Qfs', // use arrow-right
  'menu': 'yBWOyttZgk2WHNabT2VWdx2Lqz3QAn', // menu-lines
  'close': 'Zvrpzfae43icV83ulh1UqctFgDLZUp', // cross
  'home': 'Wvq7585iCYbsHgY7vvs9lvG1MXUZbW', // home
  'search': 'QPl7zSOxUKmFrWf7nOJIZNsfnurbAG', // magnifying-glass
  'filter': 'LMTOIK0mRCe6ezYBYRy3avykQaTcj2', // funnel
  'edit': 'uvT8LcYBki2O1QqshT6NUI5Uh81k3r', // pencil
  'settings': 'Xn4zIpdB3hSQrwESxcxj7pyruX0bxd', // settings
  'download': 'nWFeCAxUJT9wx2jfYft0dupH2KRVn5', // download-icon
  'refresh': 'myf9bF24UlhDmMkrTQWdwpd4JJtBaF', // refresh-icon
  'send': 'v0LP91OBaZckcNrHRNpH4uXzImn4v5', // airplane (paper plane substitute)
  'plus': 'gnzjxrOJwkuouX6K6PRVvxhoU3v1WQ', // plus-sign
  'external-link': 'BVHddl7TC3E0JCw5eBbJ2NeK5mw4Ir', // share-icon
  'link': 'KelsTEOQnq22AGUKvLMgBuS0mK4Mzh', // link-icon

  // Restaurant
  'chef-hat': 'NNaKBbsk6wEPIDwYDGs485kgjpk8VQ', // chef
  'utensils': 'Ioa8qhBkDgkmMQyTXx11jPfnAu04f2', // basic-cooking-utensil-set
  'wine': 'nuAVqei2fXLEfq8tN8RVDk6rwpXXbM', // wine-bottle
  'coffee': 'UozFyHg59uqrprxp3jHX2tzzDLQc6j', // filter-coffee
  'plate': 'Swa13h7uaHX7OPgB0ss940lRzX433D', // plate
  'dining': 'TSHMvxhYlONqWTNOPfl3LO5o9BUmZ4', // dining-table

  // People
  'users': 'WaLIdwjgmqnfE0GndCGu1R9ReZOal5', // group-of-people
  'user': 'EhKPPiNizhoSfoAbU0fYut9R1LMKyZ', // profile
  'bot': 'JLGCwuVRfvOMwVMpimP9wXFiu6Nw4x', // robot
  'dna': 'RSCqQgrjVGAcuRmzFKB3GMNZmCsun8', // dna
  'brain': 'vCbtdmRUutVmm5NeAk2OPuldTwPzC9', // brain

  // Communication
  'phone': 'y1Z0TGvr67bblbtRo9exj26PTl4f6J', // phone
  'phone-call': 'fnD4ZPpsMwsuCZ2xt3woz2HobMe80S', // call
  'phone-off': '4JenWOszbnj7MvnUwv3Imqan7lczmR', // x-mark (substitute)
  'mail': 'SxKrXPq5Lwl3YT1N6RhzLkBSY0suxp', // email
  'chat': 'ojyJBpIQ9Ktog9Md3IseRIXqSlExpm', // chat-bubble
  'bell': 'CK4odMSKWdmIj0ueBtNq9HOZR6Fbgv', // bell

  // Analytics
  'trending-up': 'viLPTsEn03czmewucv5CSZIDGQ1130', // trending-up
  'trending-down': 'uOQLRZu07kbHQLo9d9ZK5OccOf1z75', // trending-down
  'bar-chart': '73pNGHJBFF75t0zRsAgQInW9DAM4vd', // bar-chart
  'dollar': 'eFBuNm0r8VaMWxy4MM6UzQWVsUvNz7', // dollar-bill
  'credit-card': 'xylXWxjRoBYdaH9IPOx1080olvl5Ur', // credit-card
  'target': 'QUD9QBFZRZ2ZYM6AV1VO3hYmCbUAq1', // target
  'activity': 'eW7K2T3oAX5lRPHRTxPZLJuqr4HyfD', // pulse-oximeter

  // Time
  'clock': 'ecrt5EpWVPk65L4VgdKcQhSkNgjJfX', // alarm-clock
  'calendar': 'ij7GEZhfmzLNlLgDJVhkST8FIm5rJV', // calendar
  'calendar-check': 'JDRRmMHhYVAkfx593m52YMvKWp7qFg', // calendar-plus (closest)
  'timer': 'f7rdIE4CfBPLp1ltnBHOmQV1WxtMms', // timer

  // Status
  'check': '3QgwSXrWjfSV2HYyhqEm4POcAvaRqP', // check-mark
  'check-circle': 'SkUK3hw8iUeTtV3ykfIY9vRS5kLuBb', // verified
  'x-circle': '4JenWOszbnj7MvnUwv3Imqan7lczmR', // x-mark
  'alert-circle': 'PIOvFwcIsFEsLmoxc2oTkDpV6INzhL', // exclamation-mark
  'alert-triangle': 'FSCFWX0DBeBr8jibfvCV3ikItvT0BX', // warning-triangle
  'info': 'OY3MUpW2C7znoiJ6DlQN93Ku9ixhDJ', // info-icon
  'shield-check': 'CZxT18DNf12Vjv8rrZv8V0tddRi9Xu', // shield
  'ban': 'wWfZbyY0ZhLrQRWyHbElqoLT1m29xJ', // stop-sign
  'green-check': 'SkUK3hw8iUeTtV3ykfIY9vRS5kLuBb', // verified (same as check-circle)
  'red-x': '4JenWOszbnj7MvnUwv3Imqan7lczmR', // x-mark

  // UI
  'lock': 'HbfVfsPVsFP2yVgGkNF9SUo9WXLa1I', // closed-padlock
  'crown': 'o82qImf0LoNhDhTch7C2G2CwyVj9Ud', // crown
  'star': 'OhBdiUi1Ac3hO893KYRkNNtW2OQSs6', // star
  'sparkles': 'SJcxLxIC8lH8u7d9CvcOGIULgEz7wX', // sparkle
  'zap': 'kEc3FuOo6TejgI0tivfA8qPm4YIWfV', // lightning-bolt
  'gift': 'VCxaluugoXxQ6G57uYpHSlGZL18bLp', // gift-box
  'globe': 'ZltCptk3bkSEmvzEddysaedF27xcDx', // globe-earth
  'map-pin': 'DumK8ISkd9UvCLE6rmGFPz31M62DtG', // location-pin
  'dashboard': 'Qep2rmAXunWu8R2o1FCgLLDrtiD1q2', // dashboard
  'languages': 'KBUXl6AhDj2IsoZnozHL39yX1acqa5', // globe (general globe for languages)
  'accessibility': 'UH9tWPRqaPSAIoA5XEEdgLomQ3wweC', // wheelchair
  'file-text': 'BjimxRD0gb4rZBjr9jbO9LYXmOZJao', // document
  'logout': 'Nm2VSzbxC02ipeqn8dMpb7TwL6nkZw', // log-out
  'help-circle': 'GHLlVvoifSdvzv5ojMTLUf8GOVIeee', // question-mark

  // Media
  'volume': 'U8NVtxQbToN7GSMyZnp0e36cxew3VN', // speaker
  'microphone': 'KX0Z7pVafk4lcRdERs1cXpiEaqShgP', // retro-microphone
  'keyboard': 'EIMVgdKNXjK9nAb9LGnRKmVDVMOl9v', // keyboard
  'play': 'wFoKIbVifb9Q6kncGvCfU6jUeyFXuQ', // play-button
  'pause': '0DN48X7bYHwF2rin3SrjhkVmDC2JcX', // pause-icon

  // Connectivity
  'wifi': 'VXaWfLCXlsRCXSbioAplHuPLkfoqWe', // wifi
  'wifi-off': 'NIMq6Lo1RJhEY0UDPQRjLG0WZ5ROKQ', // offline-status-icon
  'stethoscope': 'YM427q0rp7oBdrNFxZLbdSyYBZNTjA', // stethoscope
  'wrench': 'rwEvYLT3gAQ9WJJXFEV6eMrbaB2EaO', // wrench
  'sun': 'o53JuZpiN3JOy3N3lXQMLmskV0OslK', // sun
  'moon': 'PtBEjX92ZU74yv9aW8wR5aS9Cd9Ohe', // moon

  // FloorPlan
  'save': 'zkoNHNPnebuzf8JJHBPLBbcmvE6422', // floppy-disk
  'rotate': 'm6Dc66jY2DwkqbDlRsdR2YK4CIpH46', // rotate-icon
  'trash': 'lSpzRMqmwGWoV08dHuh6wchQDokHkw', // trash-can
  'unlink': 'KelsTEOQnq22AGUKvLMgBuS0mK4Mzh', // link-icon (for unlink)

  // Emoji replacements
  'lightning': 'kEc3FuOo6TejgI0tivfA8qPm4YIWfV', // lightning-bolt
  'fire': 'NddQdftBhn6rEWlENfoUc4kpma0Ixv', // flame
  'lightbulb': 'JaLO4GvMZea2az0FyzzLXFoWFyjJOB', // lightbulb
  'money-bag': 'IeKGYKeLd25OWlrmd5WrSsfbD7OIPA', // money
  'party': 'a8Rmm5MutROTpDBGw2SPLVgjX1k8wT', // party-popper
  'diamond': 'E7r9iRUoXVfGqU77rOEfc32BElbORB', // diamond-gemstone
  'heart': 'RQtOXVb8LaWRBM1vFtlMCggGMulrKV', // heart
  'cycle': '3oO1FdYezMT0TBNCoEM47udBNFPzer', // recycle
  'airplane': 'v0LP91OBaZckcNrHRNpH4uXzImn4v5', // airplane
  'clipboard': 'yFtjfKzQBiN4N3in0hmfzJN0a4u71g', // clipboard
  'neighborhood': 'u5aBRmdnTQEGFTm19GseniK6MIqtWr', // neighborhood-block-party
  'classical-building': 'yKHwsV4Zg6Ka6UCoHaYCPBMxMQoLCQ', // parliament-building
  'city': 'RPlwje09GvNW5s5ocYlTdEgn9JOvfw', // city
  'scales': 'pkwywqQ9PHA9KOcEEwz0YcGDIMDXAk', // scales-of-justice
  'gear': '5WOZbM8gOwMf0RATXQa7UL57OKFSMg', // gear
  'map': 'SsfjxCJh43Hr1dqzkbFWUGH3ICZQbH', // map
  'voice': '7ofJDTp8gCoOaBWCAg26jCSFIMvmwS', // voice-actor
  'siren': 'EzILz1nOJTATOG98Jb04GR3lPcVtIo', // police-siren
};

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode === 200) {
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(true); });
      } else {
        file.close();
        fs.unlinkSync(dest);
        reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
      }
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      reject(err);
    });
  });
}

async function main() {
  const sourceDir = path.join(ICONS_DIR, 'source');
  fs.mkdirSync(sourceDir, { recursive: true });

  const entries = Object.entries(ICONS);
  console.log('Downloading ' + entries.length + ' icons...');

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  // Download in batches of 5
  for (let i = 0; i < entries.length; i += 5) {
    const batch = entries.slice(i, i + 5);
    const promises = batch.map(async ([name, fileId]) => {
      const dest = path.join(sourceDir, name + '.png');
      if (fs.existsSync(dest)) {
        const stat = fs.statSync(dest);
        if (stat.size > 10000) { // Skip if already downloaded and > 10KB
          skipped++;
          return;
        }
      }
      const url = CDN_BASE + fileId + '.png';
      try {
        await downloadFile(url, dest);
        downloaded++;
        process.stdout.write('.');
      } catch (err) {
        failed++;
        console.error('\nFailed: ' + name + ' - ' + err.message);
      }
    });
    await Promise.all(promises);
  }

  console.log('\n\nDone! Downloaded: ' + downloaded + ', Skipped: ' + skipped + ', Failed: ' + failed);

  // Export the icon names list for TypeScript types
  const typeFile = path.join(__dirname, 'icon-names.ts');
  const names = Object.keys(ICONS);
  const content = "// Auto-generated - do not edit\nexport const ICON_NAMES = [\n" +
    names.map(n => "  '" + n + "'").join(',\n') +
    "\n] as const;\n\nexport type IconName = typeof ICON_NAMES[number];\n";
  fs.writeFileSync(typeFile, content);
  console.log('Generated type file: ' + typeFile);
}

module.exports = { ICONS, CDN_BASE, ICONS_DIR };
main().catch(console.error);
