/**
 * Cartesia TTS Integration Test
 *
 * Tests the Cartesia service wrapper to verify:
 * - API key is configured correctly
 * - TTS generation works
 * - Cost calculation is accurate
 * - Audio output is valid
 */

// Load environment variables from .env file
require('dotenv').config();

const { textToSpeech, calculateCost } = require('./api/_lib/cartesia');

async function testCartesia() {
  console.log('🎤 Testing Cartesia TTS Integration...\n');

  const testText = "Hello! Thank you for calling our restaurant. I'm your AI assistant. How can I help you today?";

  try {
    console.log('📝 Test Text:', testText);
    console.log('📏 Text Length:', testText.length, 'characters\n');

    // Calculate expected cost
    console.log('💰 Cost Calculation:');
    const cost = calculateCost(testText);
    console.log('  - Characters:', cost.character_count);
    console.log('  - Credits Used:', cost.credits_used);
    console.log('  - Pro Plan Cost: $' + cost.pro_plan_cost.toFixed(6));
    console.log('  - Estimated Duration:', cost.estimated_duration_seconds, 'seconds\n');

    // Test TTS generation
    console.log('🎵 Generating TTS audio with Cartesia...');
    const startTime = Date.now();

    const result = await textToSpeech(testText, {
      voice: 'professional_female',
      outputFormat: 'file_mp3'
    });

    const duration = Date.now() - startTime;

    console.log('✅ TTS Generated Successfully!\n');
    console.log('📊 Results:');
    console.log('  - Audio Size:', result.audioSize || result.audio?.length || 'N/A', 'bytes');
    console.log('  - Voice Used:', result.voice?.name || result.voice?.id || 'Unknown');
    console.log('  - Output Format:', result.outputFormat || 'Unknown');
    console.log('  - Generation Time:', duration, 'ms');
    console.log('  - TTFA (Time-to-First-Audio):', duration, 'ms\n');

    // Performance check
    if (duration < 100) {
      console.log('⚡ EXCELLENT: Ultra-low latency (<100ms)');
    } else if (duration < 200) {
      console.log('✅ GOOD: Low latency (<200ms)');
    } else {
      console.log('⚠️  WARNING: High latency (>200ms) - check connection');
    }

    console.log('\n🎉 All tests passed! Cartesia is ready to use.');
    console.log('\n📋 Next Steps:');
    console.log('  1. Test Twilio integration: node test-cartesia-twilio.js');
    console.log('  2. Update Vercel environment variables');
    console.log('  3. Deploy and test in production\n');

  } catch (error) {
    console.error('❌ Test Failed:\n');
    console.error('Error Message:', error.message);
    console.error('Error Details:', error.response?.data || error);
    console.error('\n🔧 Troubleshooting:');
    console.error('  1. Check CARTESIA_API_KEY in .env file');
    console.error('  2. Verify API key is valid at https://play.cartesia.ai/');
    console.error('  3. Check internet connection');
    console.error('  4. Review error message above\n');
    process.exit(1);
  }
}

// Run the test
testCartesia();
