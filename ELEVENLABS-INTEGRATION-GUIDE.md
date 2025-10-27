# ElevenLabs Conversational AI Integration Guide

**Last Updated**: October 27, 2025
**Live Demo URL**: https://restaurant-ai-mcp.vercel.app/live-demo

---

## Overview

The Restaurant AI MCP platform now includes a live AI demo page where visitors can interact with your ElevenLabs conversational AI agent. The AI handles restaurant reservations through natural voice conversations.

**Demo Page**: `/live-demo`

---

## Setup Instructions

### Step 1: Get Your ElevenLabs Agent ID

1. Go to [ElevenLabs Conversational AI Dashboard](https://elevenlabs.io/app/conversational-ai)
2. Select your restaurant reservation agent
3. Copy the **Agent ID** from the URL or agent settings
   - Example URL: `https://elevenlabs.io/app/conversational-ai/abc123def456`
   - Agent ID: `abc123def456`

### Step 2: Make Agent Public

**IMPORTANT**: The widget requires a public agent with authentication disabled.

1. Go to your agent settings
2. Navigate to the **Advanced** tab
3. Set agent visibility to **Public**
4. Disable authentication
5. Save changes

### Step 3: Configure Environment Variable

#### For Local Development:

1. Create `client/.env` file (if it doesn't exist)
2. Add your agent ID:
```env
VITE_ELEVENLABS_AGENT_ID=your_agent_id_here
```

#### For Production (Vercel):

1. Go to [Vercel Dashboard](https://vercel.com/stefanogebara/restaurant-ai-mcp)
2. Navigate to **Settings** → **Environment Variables**
3. Add new variable:
   - **Name**: `VITE_ELEVENLABS_AGENT_ID`
   - **Value**: Your agent ID
   - **Environment**: Production, Preview, Development (select all)
4. Click **Save**
5. Redeploy the application:
   - Go to **Deployments** tab
   - Click the three dots on the latest deployment
   - Select **Redeploy**

---

## How It Works

### Widget Loading

The demo page automatically loads the ElevenLabs widget script:

```html
<script src="https://unpkg.com/@elevenlabs/convai-widget-embed" async type="text/javascript"></script>
```

### Widget Integration

The `ElevenLabsWidget` component creates the custom element:

```typescript
<elevenlabs-convai agent-id="YOUR_AGENT_ID"></elevenlabs-convai>
```

### Fallback Behavior

If `VITE_ELEVENLABS_AGENT_ID` is not configured:
- Widget shows placeholder message
- Configuration notice displayed
- Instructions on how to set up the variable

---

## Testing Your Integration

### Local Testing

1. Set up environment variable (Step 3 above)
2. Start development server:
```bash
cd client
npm run dev
```
3. Navigate to `http://localhost:8086/live-demo`
4. Click the AI widget
5. Allow microphone access
6. Start speaking: "I'd like to make a reservation for 2 people tonight at 7 PM"

### Production Testing

1. Deploy with environment variable configured
2. Visit `https://restaurant-ai-mcp.vercel.app/live-demo`
3. Follow the same steps as local testing

---

## Demo Page Features

### Left Column - Instructions

**How It Works** (4 steps):
1. Click the widget below
2. Allow microphone access
3. Start talking
4. Watch the magic

**Try Saying...** (Sample phrases):
- "I'd like to make a reservation for 4 people this Friday at 7 PM"
- "Do you have any tables available for 2 tonight?"
- "Book a table for 6 people tomorrow at 8 o'clock"
- "I need a reservation for 3 on Saturday evening"
- "Can I reserve a table for my anniversary dinner?"

**Demo Restaurant Info**:
- Name: La Bella Vista
- Cuisine: Fine Italian Dining
- Tables: 12
- Current Occupancy: 67%

**AI Capabilities**:
- Voice Recognition
- Natural Language
- Smart Responses
- Text-to-Speech

### Right Column - AI Widget

- ElevenLabs conversational widget
- Real-time AI ready indicator
- Response time: 2.3s avg
- Accuracy rate: 94%
- Contact Sales CTA at bottom

---

## User Flow

### Visitor Journey

1. **Landing Page** → Click "Try Live Demo" button
2. **Live Demo Page** → Read instructions
3. **Activate Widget** → Click AI assistant button
4. **Grant Permission** → Allow microphone access
5. **Speak Naturally** → Make reservation request
6. **AI Response** → AI checks availability and confirms
7. **Complete Booking** → Reservation confirmed
8. **Contact Sales** → Click button if interested

### Navigation

- **Back to Home** → Fixed button (top-left)
- **Contact Sales** → Bottom CTA (scrolls to contact form on landing page)

---

## Widget Customization

### Default Settings

The widget uses default ElevenLabs styling:
- Voice-first interface
- Text + audio multimodal support
- Automatic speech recognition
- Text-to-speech responses

### Advanced Customization (Future)

For advanced customization, you can use the ElevenLabs SDK:
- Custom colors
- Custom positioning
- Custom behavior
- Event handlers

See [ElevenLabs Widget Documentation](https://elevenlabs.io/docs/conversational-ai/customization/widget)

---

## Troubleshooting

### Widget Not Appearing

**Problem**: Widget doesn't show on demo page

**Solutions**:
1. Check environment variable is set: `VITE_ELEVENLABS_AGENT_ID`
2. Verify agent ID is correct (no spaces or quotes)
3. Ensure agent is set to Public in ElevenLabs dashboard
4. Check browser console for errors
5. Clear browser cache and reload

### Agent Not Responding

**Problem**: Widget loads but AI doesn't respond

**Solutions**:
1. Verify agent is published in ElevenLabs
2. Check authentication is disabled
3. Ensure microphone permission granted
4. Test in different browser
5. Check ElevenLabs agent history for errors

### Microphone Access Denied

**Problem**: Browser blocks microphone access

**Solutions**:
1. Grant microphone permission in browser settings
2. Use HTTPS (required for microphone access)
3. Check browser compatibility
4. Reload page after granting permission

### TypeScript Errors

**Problem**: TypeScript complains about `elevenlabs-convai` element

**Solution**: Already fixed with custom type declaration in `client/src/types/elevenlabs.d.ts`

---

## Security Considerations

### Public Agent

- Agent must be public for widget to work
- No authentication required for demo purposes
- Consider rate limiting in production
- Monitor usage in ElevenLabs dashboard

### Environment Variables

- Never commit `.env` files to git
- Use `.env.example` for documentation
- Set variables in Vercel dashboard
- Rotate agent IDs if compromised

### CORS

- Widget automatically handles CORS
- Loads from `unpkg.com` CDN
- No additional configuration needed

---

## Monitoring & Analytics

### ElevenLabs Dashboard

Monitor conversations at:
https://elevenlabs.io/app/agents/history

**Metrics Available**:
- Total conversations
- Success rate
- Average duration
- Tool usage
- Error rates

### Production Logs

Check Vercel logs for:
- Page load times
- Widget initialization
- API errors
- User interactions

---

## Best Practices

### Agent Configuration

1. **Clear System Prompt**: Define restaurant details and policies
2. **Tool Integration**: Connect to reservation API
3. **Error Handling**: Graceful fallbacks for failures
4. **Conversational Tone**: Friendly, professional, helpful
5. **Confirmation**: Always confirm booking details

### Demo Page

1. **Clear Instructions**: Step-by-step guide
2. **Sample Phrases**: Provide examples
3. **Visual Feedback**: Show AI status
4. **Error Messages**: Helpful troubleshooting
5. **Contact CTA**: Easy path to sales team

### Performance

1. **Lazy Load**: Widget loads on-demand
2. **CDN**: Uses unpkg.com for fast delivery
3. **Cleanup**: Remove script on page unmount
4. **Caching**: Browser caches widget script

---

## Integration Checklist

- [ ] Get ElevenLabs Agent ID
- [ ] Set agent to Public
- [ ] Disable authentication
- [ ] Add `VITE_ELEVENLABS_AGENT_ID` to `.env`
- [ ] Test locally at `/live-demo`
- [ ] Add environment variable to Vercel
- [ ] Deploy to production
- [ ] Test production demo page
- [ ] Verify microphone access works
- [ ] Test sample reservation phrases
- [ ] Monitor ElevenLabs dashboard
- [ ] Check Vercel logs for errors

---

## File Structure

```
client/src/
├── pages/
│   └── LiveAIDemo.tsx          # Main demo page
├── components/
│   └── ElevenLabsWidget.tsx    # Widget wrapper component
├── types/
│   └── elevenlabs.d.ts         # TypeScript declarations
└── landing/
    ├── components/
    │   ├── HeroSection.tsx     # Updated with /live-demo link
    │   └── FeaturesGrid.tsx    # Updated with /live-demo link
    └── styles/
        └── glass-morphism.css  # Design system
```

---

## API Integration

### Webhook Endpoint

The agent calls your reservation API at:
- **URL**: `https://restaurant-ai-mcp.vercel.app/api/elevenlabs-webhook`
- **Method**: POST
- **Actions**: check_availability, create_reservation, lookup_reservation

### Tools Configuration

In ElevenLabs agent settings, configure these tools:

**1. create_reservation**
```json
{
  "name": "create_reservation",
  "description": "Create a new restaurant reservation",
  "parameters": {
    "customer_name": "string",
    "customer_phone": "string",
    "customer_email": "string (optional)",
    "party_size": "number (must be NUMBER, not date)",
    "date": "string (YYYY-MM-DD format)",
    "time": "string (HH:MM format)",
    "special_requests": "string (optional)"
  }
}
```

**2. check_availability**
```json
{
  "name": "check_availability",
  "description": "Check table availability for a given date/time",
  "parameters": {
    "date": "string (YYYY-MM-DD)",
    "time": "string (HH:MM)",
    "party_size": "number"
  }
}
```

**3. lookup_reservation**
```json
{
  "name": "lookup_reservation",
  "description": "Look up existing reservation",
  "parameters": {
    "reservation_id": "string",
    "phone": "string (alternative lookup)"
  }
}
```

---

## Support

### Questions?

- **ElevenLabs Documentation**: https://elevenlabs.io/docs/conversational-ai
- **Widget Customization**: https://elevenlabs.io/docs/conversational-ai/customization/widget
- **Contact Email**: stefanogebara@gmail.com

### Common Issues

See [Troubleshooting](#troubleshooting) section above

---

## Next Steps

After successful integration:

1. **Monitor Usage**: Check ElevenLabs dashboard daily
2. **Gather Feedback**: Ask demo users for input
3. **Refine Prompts**: Improve AI responses based on data
4. **A/B Test**: Try different agent configurations
5. **Scale Up**: Consider Professional plan for more features

---

**Report Created**: October 27, 2025
**Integration Status**: READY FOR CONFIGURATION
**Created By**: Claude Code
**Contact**: stefanogebara@gmail.com
