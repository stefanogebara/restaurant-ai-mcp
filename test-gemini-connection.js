/**
 * Gemini Connection Test Script
 *
 * Tests the Google Cloud Vertex AI connection and Gemini model access.
 *
 * Prerequisites:
 * - GCP credentials configured (run setup-gcp-env.js first)
 * - Vertex AI API enabled
 * - Service account has Vertex AI User role
 *
 * Usage:
 *   node test-gemini-connection.js
 */

require('dotenv').config();
const { VertexAI } = require('@google-cloud/vertexai');

async function testGeminiConnection() {
  console.log('🔍 Testing Gemini Connection\n');

  // Step 1: Check environment variables
  console.log('1. Checking environment variables...');
  const requiredVars = [
    'GOOGLE_CLOUD_PROJECT',
    'VERTEX_AI_LOCATION',
    'GOOGLE_APPLICATION_CREDENTIALS'
  ];

  const missing = requiredVars.filter(v => !process.env[v]);
  if (missing.length > 0) {
    console.error('❌ Missing environment variables:', missing.join(', '));
    console.log('\n📝 Run: node setup-gcp-env.js');
    process.exit(1);
  }
  console.log('   ✅ All environment variables set');
  console.log('   Project:', process.env.GOOGLE_CLOUD_PROJECT);
  console.log('   Location:', process.env.VERTEX_AI_LOCATION);

  // Step 2: Check credentials file
  console.log('\n2. Checking credentials file...');
  const fs = require('fs');
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!fs.existsSync(credPath)) {
    console.error(`❌ Credentials file not found: ${credPath}`);
    process.exit(1);
  }

  try {
    const creds = JSON.parse(fs.readFileSync(credPath, 'utf8'));
    console.log('   ✅ Credentials file valid');
    console.log('   Service Account:', creds.client_email);
  } catch (error) {
    console.error('❌ Invalid credentials file:', error.message);
    process.exit(1);
  }

  // Step 3: Initialize Vertex AI
  console.log('\n3. Initializing Vertex AI client...');
  try {
    const vertexAI = new VertexAI({
      project: process.env.GOOGLE_CLOUD_PROJECT,
      location: process.env.VERTEX_AI_LOCATION,
    });
    console.log('   ✅ Vertex AI client initialized');

    // Step 4: Test Gemini model
    console.log('\n4. Testing Gemini model...');
    const model = vertexAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp',
    });

    const prompt = 'Say "Hello from Gemini!" if you can read this.';
    console.log('   Sending test prompt:', prompt);

    const result = await model.generateContent(prompt);
    const response = result.response.candidates[0].content.parts[0].text;

    console.log('   ✅ Gemini response:', response);

    // Step 5: Test structured output (for analytics)
    console.log('\n5. Testing structured output (analytics simulation)...');
    const analyticsPrompt = `
You are a restaurant analytics AI. Given this sample reservation data:
- Party size: 4
- Booking time: 2 hours before reservation
- Customer is a repeat visitor
- Special occasion: Birthday

Predict the no-show risk (0-1 probability) and provide reasoning.
Return as JSON: {"risk_score": 0.15, "risk_level": "low", "reasoning": "..."}
`.trim();

    const analyticsResult = await model.generateContent(analyticsPrompt);
    const analyticsResponse = analyticsResult.response.candidates[0].content.parts[0].text;

    console.log('   ✅ Analytics response:', analyticsResponse);

    // Success summary
    console.log('\n🎉 All tests passed!');
    console.log('\n✅ Gemini is ready for:');
    console.log('   • No-show prediction');
    console.log('   • Demand forecasting');
    console.log('   • Revenue optimization');
    console.log('   • Peak time analysis');

    console.log('\n📝 Next steps:');
    console.log('   1. Test RAG service: node test-rag-service.js');
    console.log('   2. Test full analytics: node test-predictive-analytics.js');
    console.log('   3. Update Vercel with GCP credentials');

  } catch (error) {
    console.error('\n❌ Connection test failed:', error.message);

    if (error.message.includes('not enabled')) {
      console.log('\n💡 Fix: Enable the Vertex AI API:');
      console.log('   https://console.cloud.google.com/apis/library/aiplatform.googleapis.com?project=' + process.env.GOOGLE_CLOUD_PROJECT);
    } else if (error.message.includes('permission')) {
      console.log('\n💡 Fix: Grant Vertex AI User role to service account:');
      console.log('   https://console.cloud.google.com/iam-admin/iam?project=' + process.env.GOOGLE_CLOUD_PROJECT);
    } else {
      console.log('\n💡 Debug info:');
      console.log('   Error details:', error);
    }

    process.exit(1);
  }
}

// Run the test
testGeminiConnection().catch(console.error);
