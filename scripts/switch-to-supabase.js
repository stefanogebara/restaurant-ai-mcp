/**
 * Switch API Endpoints from Airtable to Supabase
 *
 * This script automatically updates all API files to use Supabase instead of Airtable
 */

const fs = require('fs');
const path = require('path');

const filesToUpdate = [
  'api/_app/batch-predict.js',
  'api/_app/host-dashboard.js',
  'api/_app/subscription-status.js',
  'api/_app/stripe-webhook.js',
  'api/_app/reservations.js',
  'api/_app/waitlist.js',
  'api/_app/health.js',
  'api/_app/predictive-analytics.js',
  'api/_app/cron/check-late-reservations.js',
  'api/_app/elevenlabs-webhook.js',
  'api/_app/analytics.js',
  'api/_app/check-availability.js',
  'api/_app/get-wait-time.js'
];

console.log('\n========================================');
console.log('🔄 SWITCHING FROM AIRTABLE TO SUPABASE');
console.log('========================================\n');

let updatedCount = 0;
let errorCount = 0;

filesToUpdate.forEach(relativePath => {
  const filePath = path.join(process.cwd(), relativePath);

  try {
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  File not found: ${relativePath}`);
      return;
    }

    let content = fs.readFileSync(filePath, 'utf8');

    // Check if already using Supabase
    if (content.includes("require('./_lib/supabase')") || content.includes('require("./_lib/supabase")')) {
      console.log(`✓  Already using Supabase: ${relativePath}`);
      return;
    }

    // Check if file uses Airtable
    if (!content.includes('_lib/airtable')) {
      console.log(`⚠️  Doesn't use Airtable: ${relativePath}`);
      return;
    }

    // Replace the require statement
    content = content.replace(
      /require\(['"]\.\/\_lib\/airtable['"]\)/g,
      "require('./_lib/supabase')"
    );

    // Write back to file
    fs.writeFileSync(filePath, content, 'utf8');

    console.log(`✅ Updated: ${relativePath}`);
    updatedCount++;

  } catch (error) {
    console.error(`❌ Error updating ${relativePath}:`, error.message);
    errorCount++;
  }
});

console.log('\n========================================');
console.log('📊 SUMMARY');
console.log('========================================');
console.log(`✅ Files updated: ${updatedCount}`);
console.log(`❌ Errors: ${errorCount}`);
console.log(`📁 Total files processed: ${filesToUpdate.length}`);
console.log('\n✨ Migration complete!');
console.log('\nNext steps:');
console.log('1. Test the API endpoints locally');
console.log('2. Deploy to Vercel');
console.log('3. Update Vercel environment variables with Supabase credentials\n');

