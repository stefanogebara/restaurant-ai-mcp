/**
 * Build Icon Catalog from thiings.co
 *
 * This script:
 * 1. Fetches the thiings.co catalog from their pre-rendered page
 * 2. Extracts icon IDs and fileIds
 * 3. Maps our needed icon names to thiings.co icons
 * 4. Downloads the 1024x1024 PNGs
 * 5. Resizes them to sm/md/lg/xl using sharp
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const CDN_BASE = 'https://lftz25oez4aqbxpq.public.blob.vercel-storage.com/image-';
const ICONS_DIR = path.join(__dirname, '..', 'client', 'public', 'icons', '3d');

// Map of our icon names -> thiings.co icon IDs and fileIds
// These were manually curated from the 9004 icons in the catalog
const ICON_MAP = {
  // Navigation
  'arrow-right': { thiingsId: 'right-arrow', fileId: 'ePAw2OFYXZmV2f83RB7D2o5GiI3cSW' },
  'arrow-left': { thiingsId: 'left-arrow', fileId: '3TLKnTlB1iXoUEKLdVhdDCw6BpJHPT' },
  'chevron-down': { thiingsId: 'chevron-down', fileId: null }, // may need fallback
  'chevron-up': { thiingsId: 'chevron-up', fileId: null },
  'chevron-left': { thiingsId: 'chevron-left', fileId: null },
  'chevron-right': { thiingsId: 'chevron-right', fileId: null },
  'menu': { thiingsId: 'menu-lines', fileId: 'yBWOyttZgk2WHNabT2VWdx2Lqz3QAn' },
  'close': { thiingsId: 'close-icon', fileId: null },
  'home': { thiingsId: 'home', fileId: null },
  'search': { thiingsId: 'magnifying-glass', fileId: null },
  'filter': { thiingsId: 'funnel', fileId: null },
  'edit': { thiingsId: 'pencil', fileId: null },
  'settings': { thiingsId: 'settings', fileId: 'Xn4zIpdB3hSQrwESxcxj7pyruX0bxd' },
  'download': { thiingsId: 'download-icon', fileId: 'nWFeCAxUJT9wx2jfYft0dupH2KRVn5' },
  'refresh': { thiingsId: 'refresh-icon', fileId: null },
  'send': { thiingsId: 'send-icon', fileId: null },
  'plus': { thiingsId: 'plus-icon', fileId: null },
  'external-link': { thiingsId: 'external-link', fileId: null },

  // Restaurant
  'chef-hat': { thiingsId: 'chef-hat', fileId: null },
  'utensils': { thiingsId: 'basic-cooking-utensil-set', fileId: 'Ioa8qhBkDgkmMQyTXx11jPfnAu04f2' },
  'wine': { thiingsId: 'wine-bottle', fileId: 'nuAVqei2fXLEfq8tN8RVDk6rwpXXbM' },
  'coffee': { thiingsId: 'filter-coffee', fileId: 'UozFyHg59uqrprxp3jHX2tzzDLQc6j' },
  'plate': { thiingsId: 'dinner-plate', fileId: null },
  'dining': { thiingsId: 'dining-table', fileId: 'TSHMvxhYlONqWTNOPfl3LO5o9BUmZ4' },

  // People
  'users': { thiingsId: 'group-of-people', fileId: null },
  'user': { thiingsId: 'person', fileId: null },
  'bot': { thiingsId: 'robot', fileId: null },
  'dna': { thiingsId: 'dna-strand', fileId: null },
  'brain': { thiingsId: 'brain', fileId: null },

  // Communication
  'phone': { thiingsId: 'phone', fileId: null },
  'phone-call': { thiingsId: 'phone-call', fileId: null },
  'phone-off': { thiingsId: 'phone-off', fileId: null },
  'mail': { thiingsId: 'email', fileId: 'SxKrXPq5Lwl3YT1N6RhzLkBSY0suxp' },
  'chat': { thiingsId: 'chat-bubble', fileId: null },
  'bell': { thiingsId: 'bell', fileId: null },

  // Analytics
  'trending-up': { thiingsId: 'trending-up', fileId: null },
  'trending-down': { thiingsId: 'trending-down', fileId: null },
  'bar-chart': { thiingsId: 'bar-chart', fileId: '73pNGHJBFF75t0zRsAgQInW9DAM4vd' },
  'dollar': { thiingsId: 'dollar-sign', fileId: null },
  'credit-card': { thiingsId: 'credit-card', fileId: null },
  'target': { thiingsId: 'target', fileId: null },
  'activity': { thiingsId: 'pulse', fileId: null },

  // Time
  'clock': { thiingsId: 'alarm-clock', fileId: null },
  'calendar': { thiingsId: 'wall-calendar', fileId: 'Sae9tyL6cjfCtWIsMdmFt0tn7Iu2tQ' },
  'calendar-check': { thiingsId: 'calendar-check', fileId: null },
  'timer': { thiingsId: 'timer', fileId: null },

  // Status
  'check': { thiingsId: 'check-mark', fileId: null },
  'check-circle': { thiingsId: 'green-checkmark', fileId: null },
  'x-circle': { thiingsId: 'red-x', fileId: null },
  'alert-circle': { thiingsId: 'exclamation-mark', fileId: null },
  'alert-triangle': { thiingsId: 'warning-triangle', fileId: 'FSCFWX0DBeBr8jibfvCV3ikItvT0BX' },
  'info': { thiingsId: 'info-icon', fileId: null },
  'shield-check': { thiingsId: 'shield', fileId: null },
  'ban': { thiingsId: 'banned', fileId: null },
  'green-check': { thiingsId: 'green-checkmark', fileId: null },
  'red-x': { thiingsId: 'red-x', fileId: null },
  'warning': { thiingsId: 'warning-triangle', fileId: 'FSCFWX0DBeBr8jibfvCV3ikItvT0BX' },

  // UI
  'lock': { thiingsId: 'padlock', fileId: null },
  'crown': { thiingsId: 'crown', fileId: null },
  'star': { thiingsId: 'gold-star', fileId: null },
  'sparkles': { thiingsId: 'sparkle', fileId: 'SJcxLxIC8lH8u7d9CvcOGIULgEz7wX' },
  'zap': { thiingsId: 'lightning-bolt', fileId: null },
  'gift': { thiingsId: 'gift-box', fileId: null },
  'globe': { thiingsId: 'globe-earth', fileId: 'ZltCptk3bkSEmvzEddysaedF27xcDx' },
  'map-pin': { thiingsId: 'location-pin', fileId: null },
  'dashboard': { thiingsId: 'dashboard', fileId: null },
  'languages': { thiingsId: 'languages', fileId: null },
  'accessibility': { thiingsId: 'accessibility', fileId: null },
  'file-text': { thiingsId: 'document', fileId: null },
  'logout': { thiingsId: 'logout', fileId: null },
  'help-circle': { thiingsId: 'question-mark', fileId: null },

  // Media
  'volume': { thiingsId: 'speaker', fileId: null },
  'microphone': { thiingsId: 'microphone', fileId: null },
  'keyboard': { thiingsId: 'keyboard', fileId: null },
  'play': { thiingsId: 'play-button', fileId: null },
  'pause': { thiingsId: 'pause-icon', fileId: '0DN48X7bYHwF2rin3SrjhkVmDC2JcX' },

  // Connectivity
  'wifi': { thiingsId: 'wifi', fileId: 'VXaWfLCXlsRCXSbioAplHuPLkfoqWe' },
  'wifi-off': { thiingsId: 'no-wifi', fileId: null },
  'stethoscope': { thiingsId: 'stethoscope', fileId: null },
  'wrench': { thiingsId: 'wrench', fileId: null },
  'sun': { thiingsId: 'sun', fileId: null },
  'moon': { thiingsId: 'crescent-moon', fileId: null },

  // FloorPlan
  'save': { thiingsId: 'floppy-disk', fileId: null },
  'rotate': { thiingsId: 'rotate-icon', fileId: 'm6Dc66jY2DwkqbDlRsdR2YK4CIpH46' },
  'trash': { thiingsId: 'trash-can', fileId: null },
  'unlink': { thiingsId: 'unlink', fileId: null },

  // Emoji replacements
  'lightning': { thiingsId: 'lightning-bolt', fileId: null },
  'fire': { thiingsId: 'flame', fileId: null },
  'lightbulb': { thiingsId: 'lightbulb', fileId: 'JaLO4GvMZea2az0FyzzLXFoWFyjJOB' },
  'money-bag': { thiingsId: 'money', fileId: 'IeKGYKeLd25OWlrmd5WrSsfbD7OIPA' },
  'party': { thiingsId: 'party-popper', fileId: null },
  'diamond': { thiingsId: 'diamond-gemstone', fileId: 'E7r9iRUoXVfGqU77rOEfc32BElbORB' },
  'heart': { thiingsId: 'heart', fileId: null },
  'cycle': { thiingsId: 'cycle', fileId: null },
  'airplane': { thiingsId: 'airplane', fileId: null },
  'clipboard': { thiingsId: 'clipboard', fileId: null },
  'neighborhood': { thiingsId: 'neighborhood', fileId: null },
  'classical-building': { thiingsId: 'classical-building', fileId: null },
  'city': { thiingsId: 'city', fileId: 'RPlwje09GvNW5s5ocYlTdEgn9JOvfw' },
  'scales': { thiingsId: 'scales', fileId: null },
  'gear': { thiingsId: 'gear', fileId: null },
  'map': { thiingsId: 'map', fileId: null },
  'voice': { thiingsId: 'microphone', fileId: null },
  'siren': { thiingsId: 'police-siren', fileId: 'EzILz1nOJTATOG98Jb04GR3lPcVtIo' },
};

// Export for use by other scripts
module.exports = { ICON_MAP, CDN_BASE, ICONS_DIR };

if (require.main === module) {
  console.log(`Icon catalog: ${Object.keys(ICON_MAP).length} icons defined`);
  const withFileId = Object.entries(ICON_MAP).filter(([, v]) => v.fileId);
  const withoutFileId = Object.entries(ICON_MAP).filter(([, v]) => !v.fileId);
  console.log(`  ${withFileId.length} with known fileIds`);
  console.log(`  ${withoutFileId.length} need fileId lookup`);
  console.log('\nIcons needing fileId lookup:');
  withoutFileId.forEach(([name, v]) => console.log(`  ${name} -> thiings: ${v.thiingsId}`));
}
