/**
 * GCP Environment Setup Script
 *
 * This script updates the .env file with Google Cloud Platform credentials
 * after you've completed the manual GCP setup steps.
 *
 * Prerequisites:
 * 1. APIs enabled (Vertex AI, Generative Language, Cloud Run)
 * 2. Service account created with Vertex AI User role
 * 3. JSON credentials downloaded to ./gcp-credentials.json
 *
 * Usage:
 *   node setup-gcp-env.js
 */

const fs = require('fs');
const path = require('path');

const CREDENTIALS_PATH = path.join(__dirname, 'gcp-credentials.json');
const ENV_PATH = path.join(__dirname, '.env');

console.log('🔧 GCP Environment Setup\n');

// Step 1: Check if credentials file exists
if (!fs.existsSync(CREDENTIALS_PATH)) {
  console.error('❌ Error: gcp-credentials.json not found!');
  console.log('\n📝 Please complete these steps first:');
  console.log('   1. Open QUICK-GCP-SETUP.md');
  console.log('   2. Follow Step 1: Enable APIs');
  console.log('   3. Follow Step 2: Create Service Account');
  console.log('   4. Download the JSON key to: ' + CREDENTIALS_PATH);
  console.log('\nThen run this script again.');
  process.exit(1);
}

// Step 2: Read and validate credentials
let credentials;
try {
  credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  console.log('✅ Found credentials file');
  console.log('   Project ID:', credentials.project_id);
  console.log('   Service Account:', credentials.client_email);
} catch (error) {
  console.error('❌ Error reading credentials:', error.message);
  process.exit(1);
}

// Step 3: Read existing .env file
let envContent = '';
if (fs.existsSync(ENV_PATH)) {
  envContent = fs.readFileSync(ENV_PATH, 'utf8');
  console.log('\n✅ Found existing .env file');
} else {
  console.log('\n⚠️  No .env file found, creating new one');
}

// Step 4: Add or update GCP variables
const gcpVars = {
  'GOOGLE_CLOUD_PROJECT': credentials.project_id,
  'VERTEX_AI_LOCATION': 'us-central1',
  'GOOGLE_APPLICATION_CREDENTIALS': './gcp-credentials.json',
  'GEMINI_MODEL': 'gemini-2.0-flash-exp'
};

// Check if GCP section exists
if (!envContent.includes('# Google Cloud Platform')) {
  // Add GCP section
  envContent += '\n\n# Google Cloud Platform (Vertex AI & Gemini)\n';
  for (const [key, value] of Object.entries(gcpVars)) {
    envContent += `${key}=${value}\n`;
  }
  console.log('\n✅ Added GCP configuration to .env');
} else {
  // Update existing GCP variables
  for (const [key, value] of Object.entries(gcpVars)) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (envContent.match(regex)) {
      envContent = envContent.replace(regex, `${key}=${value}`);
      console.log(`✅ Updated ${key}`);
    } else {
      // Find GCP section and add variable
      const gcpSectionRegex = /(# Google Cloud Platform[^\n]*\n)/;
      envContent = envContent.replace(gcpSectionRegex, `$1${key}=${value}\n`);
      console.log(`✅ Added ${key}`);
    }
  }
}

// Step 5: Write updated .env file
fs.writeFileSync(ENV_PATH, envContent);
console.log('\n✅ .env file updated successfully!');

// Step 6: Verification
console.log('\n📋 Verification:');
console.log('   ✓ Credentials file: gcp-credentials.json');
console.log('   ✓ Project ID:', gcpVars.GOOGLE_CLOUD_PROJECT);
console.log('   ✓ Location:', gcpVars.VERTEX_AI_LOCATION);
console.log('   ✓ Model:', gcpVars.GEMINI_MODEL);

console.log('\n🎉 GCP setup complete!');
console.log('\n📝 Next steps:');
console.log('   1. Test the connection: node test-gemini-connection.js');
console.log('   2. Update Vercel environment variables');
console.log('   3. Test predictive analytics service');

// Step 7: Check if running on Windows and offer to update Vercel
console.log('\n💡 Tip: Remember to add these variables to Vercel:');
console.log('   https://vercel.com/stefanogebaras-projects/restaurant-ai-mcp/settings/environment-variables');
