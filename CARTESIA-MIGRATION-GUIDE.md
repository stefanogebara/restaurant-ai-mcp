# Cartesia Migration Guide

## Overview

This guide walks you through migrating from ElevenLabs to Cartesia AI for text-to-speech services.

**Why Migrate?**
- **98% Cost Savings**: $0.00154/min vs $0.10/min (ElevenLabs)
- **Ultra-Low Latency**: 40-90ms Time-to-First-Audio vs 75-300ms
- **Voice Cloning**: Just 3 seconds of audio vs 30 seconds
- **Emotional TTS**: Real-time emotion control with laughter support
- **Same Features**: Twilio integration, streaming, high-quality voices

## Cost Comparison

### Current (ElevenLabs)
- **Usage**: 1,050 minutes/month
- **Cost**: $105/month (~$0.10/min)
- **Annual**: $1,260/year

### After Migration (Cartesia)
- **Usage**: 1,050 minutes/month
- **Cost**: $2.31/month ($5 Pro plan covers it)
- **Annual**: $60/year (Pro plan @ $5/month)

**Total Savings**: $1,200/year (98% reduction)

## Migration Steps

### Phase 1: Setup (10 minutes)

#### 1.1 Get Cartesia API Key

1. Visit https://play.cartesia.ai/
2. Sign up for an account
3. Go to Console → API Keys
4. Generate a new API key
5. Copy the key (starts with `sk-cart-...`)

#### 1.2 Choose Your Plan

**Recommended for Testing: Pro Plan ($5/month)**
- 500K credits (500K characters)
- Perfect for ~1,000 minutes/month
- Full feature access
- Cancel anytime

**For Production: Scale Plan ($25/month)**
- 3M credits (3M characters)
- For high-volume usage (5,000+ minutes/month)
- Volume discounts available

**Start with Pro**: You can always upgrade later.

#### 1.3 Update Environment Variables

**Local Development (.env file):**
```bash
# Add these lines to your .env file
CARTESIA_API_KEY=sk-cart-your-api-key-here
USE_CARTESIA=false  # Set to true when ready to test
```

**Production (Vercel Dashboard):**
1. Go to https://vercel.com/your-project/settings/environment-variables
2. Add:
   - `CARTESIA_API_KEY`: `sk-cart-your-api-key-here`
   - `USE_CARTESIA`: `false` (set to `true` when ready to switch)

### Phase 2: Testing (1 hour)

#### 2.1 Test TTS Locally

Create a test script `test-cartesia.js`:

```javascript
const { textToSpeech, calculateCost } = require('./api/_lib/cartesia');

async function testCartesia() {
  const testText = "Hello! Thank you for calling our restaurant. I'm your AI assistant. How can I help you today?";

  console.log('Testing Cartesia TTS...');

  // Test basic TTS
  const result = await textToSpeech(testText, {
    voice: 'professional_female',
    outputFormat: 'file_mp3'
  });

  console.log('✅ TTS generated successfully!');
  console.log('Audio size:', result.audio.length, 'bytes');

  // Calculate cost
  const cost = calculateCost(testText);
  console.log('Cost breakdown:', cost);
}

testCartesia().catch(console.error);
```

Run:
```bash
node test-cartesia.js
```

Expected output:
```
Testing Cartesia TTS...
✅ TTS generated successfully!
Audio size: 45123 bytes
Cost breakdown: {
  character_count: 105,
  credits_used: 105,
  pro_plan_cost: 0.00000105,
  scale_plan_cost: 0.000000875,
  free_credits_remaining: 9895,
  estimated_duration_seconds: 8
}
```

#### 2.2 Test Twilio Integration

Update your Twilio webhook (in Twilio Console):

**Testing URL**: `https://your-domain.vercel.app/api/cartesia-twilio`

Make a test call to your Twilio number. You should hear:
> "Hello! Thank you for calling our restaurant. I'm your AI assistant..."

**Checklist:**
- [ ] Call connects successfully
- [ ] Voice quality is clear
- [ ] No noticeable latency
- [ ] Speech recognition works
- [ ] Responses are natural

#### 2.3 A/B Testing (Optional)

Enable Cartesia for 10% of calls to compare:

```javascript
// In api/cartesia-twilio.js
const { isInRolloutGroup } = require('./_lib/feature-flags');

// At the start of the handler
const callerId = req.body.From; // Phone number
if (!isInRolloutGroup(callerId, 10)) {
  // Redirect 90% to ElevenLabs
  return res.redirect('/api/elevenlabs-webhook');
}
// 10% continue with Cartesia
```

Monitor for 1 week:
- Call quality
- Response time
- Customer satisfaction
- Error rates

### Phase 3: Full Migration (30 minutes)

Once testing is successful:

#### 3.1 Enable Cartesia Globally

**Local (.env):**
```bash
USE_CARTESIA=true
```

**Vercel:**
1. Go to Environment Variables
2. Update `USE_CARTESIA` to `true`
3. Redeploy (Vercel auto-deploys)

#### 3.2 Update Twilio Webhooks

In Twilio Console, update all webhook URLs:

**Before**: `https://your-domain.com/api/elevenlabs-webhook`
**After**: `https://your-domain.com/api/cartesia-twilio`

Or keep the same URL and let the feature flag handle routing.

#### 3.3 Verify Production

Make test calls:
1. New reservation
2. Check availability
3. Cancel reservation
4. Edge cases (no speech, background noise)

Monitor Vercel logs for errors.

### Phase 4: Cleanup (Optional)

After 1 month of successful operation:

1. **Cancel ElevenLabs** (if not using conversational AI features)
   - Go to https://elevenlabs.io/app/settings/billing
   - Cancel subscription
   - Keep API key active for 30 more days (rollback safety)

2. **Remove ElevenLabs dependency** (after 60 days)
   - Remove from package.json
   - Archive elevenlabs-webhook.js
   - Update documentation

## Rollback Plan

If issues arise, immediately rollback:

### Quick Rollback (5 minutes)

**Option 1: Feature Flag**
```bash
# Vercel Dashboard
USE_CARTESIA=false
```

Redeploy. All traffic routes to ElevenLabs.

**Option 2: Twilio Webhook**
Update Twilio webhook back to:
```
https://your-domain.com/api/elevenlabs-webhook
```

### Common Issues & Solutions

#### Issue: "CARTESIA_API_KEY not set"
**Solution**: Add API key to .env and Vercel environment variables.

#### Issue: Audio quality poor
**Solution**: Try different voice IDs or adjust sample rate:
```javascript
textToSpeech(text, {
  voice: 'professional_male', // Try different voice
  outputFormat: 'twilio'
})
```

#### Issue: High latency
**Solution**: Enable WebSocket streaming:
```javascript
streamTextToSpeech(text, {
  streaming: true,
  outputFormat: 'twilio'
})
```

#### Issue: Twilio webhook timeout
**Solution**: Increase Twilio timeout to 30 seconds or use async processing.

## Feature Comparison

| Feature | ElevenLabs | Cartesia | Migration Impact |
|---------|-----------|----------|------------------|
| **TTS Quality** | Excellent | Excellent | ✅ No change |
| **Latency** | 75-300ms | 40-90ms | ✅ Improved |
| **Voice Cloning** | 30s audio | 3s audio | ✅ Improved |
| **Emotional TTS** | Limited | Advanced | ✅ Improved |
| **Laughter** | No | Yes | ✅ New feature |
| **Conversational AI** | Yes | No | ⚠️ Use separate STT |
| **Twilio Integration** | Yes | Yes | ✅ No change |
| **Cost** | $0.10/min | $0.00154/min | ✅ 98% savings |

## Architecture Changes

### Before (ElevenLabs)
```
Phone Call → Twilio → ElevenLabs Webhook
                          ├─ STT (Speech-to-Text)
                          ├─ LLM (Conversation)
                          └─ TTS (Text-to-Speech)
```

### After (Cartesia)
```
Phone Call → Twilio → Cartesia-Twilio Endpoint
                          ├─ STT (Twilio/Anthropic)
                          ├─ LLM (Claude/OpenAI)
                          └─ TTS (Cartesia)
```

**Note**: ElevenLabs provides all-in-one conversational AI. With Cartesia, you manage:
- **STT**: Twilio's speech recognition or Anthropic
- **LLM**: Claude for conversation logic
- **TTS**: Cartesia for voice synthesis

**Benefit**: More control, better latency, 98% cost savings.

## Voice Configuration

### Available Voices

```javascript
// Professional (recommended for restaurants)
voice: 'professional_female'  // Warm, clear, professional
voice: 'professional_male'    // Authoritative, clear

// Conversational (friendly, engaging)
voice: 'conversational_female'
voice: 'conversational_male'

// Custom (clone your own voice)
voice: 'custom_voice_id'  // After cloning
```

### Emotional Control

```javascript
emotionalTextToSpeech(text, {
  positivity: 'high',      // Warm, friendly
  curiosity: 'low',        // Neutral
  surprise: 'low',         // Calm
  laughter: true          // Enable laughter detection
})
```

### Speed Control

```javascript
textToSpeech(text, {
  speed: 1.2  // 20% faster (range: 0.5 - 2.0)
})
```

## Monitoring & Analytics

### Track Usage

```javascript
const { calculateCost } = require('./api/_lib/cartesia');

// Log every TTS request
const cost = calculateCost(text);
console.log('TTS Cost:', cost);

// Monthly totals
// Pro plan: $5 for 500K chars
// Track: character_count, pro_plan_cost
```

### Performance Metrics

Monitor in Vercel logs:
```
[Cartesia] Generating speech: { text: "...", voice: "...", model: "..." }
[Cartesia] Speech generated successfully
[Cartesia] TTFA: 45ms  # Time-to-First-Audio
```

**Target Metrics:**
- TTFA < 100ms: ✅ Excellent
- TTFA 100-200ms: ⚠️ Good
- TTFA > 200ms: ❌ Investigate

## Cost Optimization Tips

1. **Use shorter prompts** - Each character = 1 credit
2. **Cache common phrases** - "Hello, thank you for calling..."
3. **Batch requests** - Combine multiple sentences
4. **Choose right plan**:
   - Free: 10K chars/month (testing only)
   - Pro: 500K chars/month (~$5) = ~1,000 minutes
   - Scale: 3M chars/month (~$25) = ~6,000 minutes

## Support & Resources

### Cartesia Documentation
- **API Reference**: https://docs.cartesia.ai/
- **Voice Library**: https://play.cartesia.ai/voices
- **Examples**: https://github.com/cartesia-ai/examples

### Get Help
- **Cartesia Discord**: https://discord.gg/cartesia
- **Email Support**: support@cartesia.ai
- **API Status**: https://status.cartesia.ai

### Internal Resources
- Feature flags: `api/_lib/feature-flags.js`
- Cartesia service: `api/_lib/cartesia.js`
- Twilio integration: `api/cartesia-twilio.js`

## Success Checklist

Migration is complete when:

- [ ] Cartesia API key configured
- [ ] Local testing passed
- [ ] Twilio integration working
- [ ] Production calls successful
- [ ] Cost savings verified ($105 → $5/month)
- [ ] Voice quality acceptable
- [ ] Latency improved (<100ms TTFA)
- [ ] Team trained on new system
- [ ] Documentation updated
- [ ] Rollback plan tested

## Timeline

- **Week 1**: Setup + Local Testing (Phase 1-2)
- **Week 2**: A/B Testing 10% traffic (Phase 2.3)
- **Week 3**: Full Migration (Phase 3)
- **Week 4**: Monitor + Optimize
- **Month 2**: Cancel ElevenLabs (Phase 4)

**Total Time**: 4 weeks for safe, gradual migration.

---

**Questions?** Contact the development team or check the Cartesia documentation.

**Need to rollback?** See "Rollback Plan" section above.
