/**
 * Lookup fileIds from the thiings.co catalog
 * Run: node scripts/lookup-fileids.js
 */

const fs = require('fs');
const https = require('https');
const path = require('path');

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function main() {
  console.log('Fetching thiings.co catalog...');
  const html = await fetch('https://www.thiings.co/things');

  // Extract RSC payload
  const pushes = [...html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)];
  let combined = '';
  pushes.forEach(m => combined += m[1]);
  combined = combined.replace(/\\"/g, '"').replace(/\\\//g, '/');

  // Parse all icons
  const pattern = /"id":"([^"]+)","name":"([^"]+)","categories":\[([^\]]*)\],"fileId":"([^"]+)"/g;
  const catalog = [];
  let match;
  while ((match = pattern.exec(combined)) !== null) {
    catalog.push({
      id: match[1],
      name: match[2],
      categories: match[3],
      fileId: match[4]
    });
  }
  console.log('Catalog: ' + catalog.length + ' icons');

  // Our needed mappings - thiingsId -> search terms to find best match
  const lookups = {
    'arrow-right': ['right-arrow', 'arrow-right', 'right arrow'],
    'arrow-left': ['left-arrow', 'arrow-left', 'left arrow'],
    'chevron-down': ['chevron-down', 'down-chevron', 'caret-down', 'dropdown'],
    'chevron-up': ['chevron-up', 'up-chevron', 'caret-up'],
    'chevron-left': ['chevron-left', 'left-chevron'],
    'chevron-right': ['chevron-right', 'right-chevron'],
    'close': ['close-icon', 'x-icon', 'cross', 'close'],
    'home': ['home', 'house'],
    'search': ['magnifying-glass', 'search', 'search-icon'],
    'filter': ['funnel', 'filter'],
    'edit': ['pencil', 'edit-icon', 'edit'],
    'refresh': ['refresh-icon', 'refresh', 'reload'],
    'send': ['send-icon', 'send', 'paper-plane'],
    'plus': ['plus-icon', 'plus', 'add'],
    'external-link': ['external-link', 'open-link', 'share-icon'],
    'chef-hat': ['chef-hat', 'chefs-hat', 'chef'],
    'plate': ['dinner-plate', 'plate', 'dish'],
    'users': ['group-of-people', 'team', 'people', 'users'],
    'user': ['person', 'user', 'avatar', 'profile'],
    'bot': ['robot', 'bot', 'ai'],
    'dna': ['dna-strand', 'dna', 'helix'],
    'brain': ['brain'],
    'phone': ['phone', 'telephone', 'mobile-phone', 'smartphone'],
    'phone-call': ['phone-call', 'incoming-call', 'call'],
    'phone-off': ['phone-off', 'missed-call', 'no-phone'],
    'chat': ['chat-bubble', 'speech-bubble', 'message', 'chat'],
    'bell': ['bell', 'notification-bell', 'notification'],
    'trending-up': ['trending-up', 'upward-trend', 'growth', 'increase'],
    'trending-down': ['trending-down', 'downward-trend', 'decrease'],
    'dollar': ['dollar-sign', 'dollar', 'money-sign', 'currency'],
    'credit-card': ['credit-card', 'payment-card', 'bank-card'],
    'target': ['target', 'bullseye', 'dartboard'],
    'activity': ['pulse', 'heartbeat', 'activity', 'vital'],
    'clock': ['alarm-clock', 'clock', 'time', 'wall-clock'],
    'calendar-check': ['calendar-check', 'scheduled', 'appointment'],
    'timer': ['timer', 'stopwatch', 'hourglass'],
    'check': ['check-mark', 'checkmark', 'tick'],
    'check-circle': ['green-checkmark', 'verified', 'approved', 'check-circle'],
    'x-circle': ['red-x', 'cancel', 'denied', 'error-icon'],
    'alert-circle': ['exclamation-mark', 'alert', 'exclamation'],
    'info': ['info-icon', 'info', 'information'],
    'shield-check': ['shield', 'security', 'protected'],
    'ban': ['banned', 'prohibited', 'no-entry', 'ban'],
    'green-check': ['green-checkmark', 'verified', 'approved'],
    'red-x': ['red-x', 'cancel', 'denied'],
    'lock': ['padlock', 'lock', 'secure'],
    'crown': ['crown', 'royal-crown', 'king-crown'],
    'star': ['gold-star', 'star', 'favorite'],
    'zap': ['lightning-bolt', 'lightning', 'bolt', 'zap'],
    'gift': ['gift-box', 'present', 'gift'],
    'map-pin': ['location-pin', 'map-pin', 'pin', 'location'],
    'dashboard': ['dashboard', 'gauge', 'speedometer'],
    'languages': ['languages', 'translate', 'translation', 'language'],
    'accessibility': ['accessibility', 'wheelchair', 'accessible'],
    'file-text': ['document', 'file', 'paper', 'note'],
    'logout': ['logout', 'log-out', 'exit', 'sign-out'],
    'help-circle': ['question-mark', 'help', 'question'],
    'volume': ['speaker', 'volume', 'sound', 'audio'],
    'microphone': ['microphone', 'mic', 'recording'],
    'keyboard': ['keyboard', 'typing'],
    'play': ['play-button', 'play'],
    'wifi-off': ['no-wifi', 'wifi-off', 'offline', 'disconnected'],
    'stethoscope': ['stethoscope', 'medical', 'diagnosis'],
    'wrench': ['wrench', 'tool', 'repair'],
    'sun': ['sun', 'sunny', 'daylight', 'bright'],
    'moon': ['crescent-moon', 'moon', 'night', 'lunar'],
    'save': ['floppy-disk', 'save', 'diskette'],
    'trash': ['trash-can', 'garbage', 'delete', 'bin', 'trash'],
    'unlink': ['unlink', 'broken-link', 'disconnect', 'chain'],
    'lightning': ['lightning-bolt', 'lightning', 'electric', 'bolt'],
    'fire': ['flame', 'fire', 'hot', 'burning'],
    'party': ['party-popper', 'celebration', 'confetti', 'party'],
    'heart': ['heart', 'love', 'red-heart'],
    'cycle': ['cycle', 'recycle', 'loop', 'circular'],
    'airplane': ['airplane', 'plane', 'flight', 'jet'],
    'clipboard': ['clipboard', 'paste', 'clipboard-stand'],
    'neighborhood': ['neighborhood', 'suburb', 'houses', 'residential'],
    'classical-building': ['classical-building', 'greek-temple', 'parliament', 'courthouse', 'pillars'],
    'scales': ['scales', 'balance', 'justice', 'weighing'],
    'gear': ['gear', 'cog', 'settings-gear'],
    'map': ['map', 'world-map', 'treasure-map', 'folded-map'],
    'voice': ['microphone', 'voice', 'speaking'],
  };

  console.log('\n=== FileId Lookup Results ===');
  const results = {};

  for (const [ourName, searchTerms] of Object.entries(lookups)) {
    let bestMatch = null;
    let bestScore = 0;

    for (const term of searchTerms) {
      // Exact ID match is best
      const exactId = catalog.find(i => i.id === term);
      if (exactId) {
        bestMatch = exactId;
        bestScore = 100;
        break;
      }

      // Partial ID match
      const partialId = catalog.find(i => i.id.includes(term) && !i.id.includes('-') || i.id === term);
      if (partialId && bestScore < 90) {
        bestMatch = partialId;
        bestScore = 90;
      }

      // Name match
      const nameMatch = catalog.find(i => i.name.toLowerCase() === term.replace(/-/g, ' '));
      if (nameMatch && bestScore < 80) {
        bestMatch = nameMatch;
        bestScore = 80;
      }

      // Partial name match
      if (bestScore < 50) {
        const partial = catalog.find(i =>
          i.id.includes(term) ||
          i.name.toLowerCase().includes(term.replace(/-/g, ' '))
        );
        if (partial) {
          bestMatch = partial;
          bestScore = 50;
        }
      }
    }

    if (bestMatch) {
      results[ourName] = { id: bestMatch.id, fileId: bestMatch.fileId, score: bestScore };
      console.log('  ' + ourName + ' -> "' + bestMatch.id + '" (fileId: ' + bestMatch.fileId + ') [score: ' + bestScore + ']');
    } else {
      console.log('  ' + ourName + ' -> NO MATCH');
    }
  }

  // Output as JSON for use
  const outputPath = path.join(__dirname, 'icon-fileids.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log('\nSaved to ' + outputPath);
}

main().catch(console.error);
