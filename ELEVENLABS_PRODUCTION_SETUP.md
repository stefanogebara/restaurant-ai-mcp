# ElevenLabs Production Integration Guide
## Making Your AI Phone Agent Live for Real Customers

**Created**: October 18, 2025
**Status**: Production Setup Guide
**Estimated Time**: 30-45 minutes

---

## 🎯 Goal

Set up your ElevenLabs Conversational AI agent so that **real customers can call a phone number** and make reservations without any manual intervention. The agent will be live 24/7, handling calls automatically.

---

## 📋 Prerequisites

### What You Already Have ✅
- ✅ ElevenLabs agent created and configured
- ✅ Webhook endpoint: `https://restaurant-ai-mcp.vercel.app/api/elevenlabs-webhook`
- ✅ Tools configured (create_reservation, check_availability, etc.)
- ✅ LLM model: GLM-4.5-Air (optimized for <2s response time)
- ✅ Backend API fully functional

### What You Need
- [ ] ElevenLabs account with phone credits
- [ ] Decision: Use ElevenLabs phone number OR integrate your own
- [ ] (Optional) Custom phone number from Twilio

---

## 🚀 Production Setup Steps

### Step 1: Purchase Phone Number from ElevenLabs

ElevenLabs offers two options for phone numbers:

#### Option A: ElevenLabs Managed Phone Number (RECOMMENDED - Easiest)
**Pros**:
- No additional setup required
- Managed by ElevenLabs
- Instant activation
- Pay-as-you-go pricing

**Cons**:
- Can't port to another service later
- Limited customization
- Phone number is owned by ElevenLabs

**How to Set Up**:
1. Go to https://elevenlabs.io/app/conversational-ai
2. Click on your agent
3. Navigate to "Phone" tab
4. Click "Get Phone Number"
5. Select your country/region
6. Choose area code (if available)
7. Purchase number ($10-20/month + usage)
8. Number is instantly activated

**Pricing** (as of Oct 2025):
- Base: ~$10-20/month for number rental
- Inbound calls: ~$0.02-0.04/minute
- Text-to-Speech: Included in your ElevenLabs plan
- LLM costs: Included if using ElevenLabs LLM

#### Option B: Bring Your Own Number (BYOPN) via Twilio
**Pros**:
- You own the number
- Can port to other services later
- More control over telephony
- Better analytics

**Cons**:
- More complex setup
- Need separate Twilio account
- Additional costs (Twilio + ElevenLabs)

**How to Set Up**:
1. Create Twilio account: https://www.twilio.com/try-twilio
2. Purchase phone number ($1-15/month depending on country)
3. Get Twilio SID and Auth Token
4. In ElevenLabs, go to agent → Phone tab
5. Click "Connect Twilio Number"
6. Enter Twilio credentials
7. Select your Twilio number
8. ElevenLabs will configure webhook automatically

**Pricing**:
- Twilio number: $1-15/month
- Twilio inbound: $0.0085/minute
- ElevenLabs processing: $0.02-0.04/minute
- Total: ~$0.03-0.05/minute

---

### Step 2: Configure Agent for Production

#### 2.1 Enable Phone Calling

**In ElevenLabs Dashboard**:
1. Go to your agent settings
2. Navigate to "Phone" tab
3. Enable "Accept Inbound Calls"
4. Set call handling:
   - **Max call duration**: 10 minutes (recommended)
   - **Call timeout**: 30 seconds if no speech detected
   - **End call phrases**: "goodbye", "hang up", "that's all"

#### 2.2 Set Business Hours (Optional but Recommended)

Configure when the agent should answer vs send to voicemail:

```
Business Hours:
- Monday-Thursday: 10:00 AM - 10:00 PM
- Friday-Saturday: 10:00 AM - 11:00 PM
- Sunday: 10:00 AM - 9:00 PM

After Hours Message:
"Thank you for calling [Restaurant Name]. We're currently closed. Our hours are [hours]. Please call back during business hours or visit our website to make a reservation online. Thank you!"
```

**How to Set**:
1. In agent settings → "Phone" tab
2. Click "Business Hours"
3. Set hours for each day
4. Configure after-hours greeting
5. Save

#### 2.3 Configure Voicemail (Important!)

**Why**: If agent can't handle a call (too many concurrent calls, system error), customers should be able to leave a message.

**Setup**:
1. In agent settings → "Phone" tab
2. Enable "Voicemail"
3. Set voicemail greeting:
   ```
   "You've reached [Restaurant Name]. We're unable to take your call right now. Please leave your name, phone number, and preferred reservation date and time, and we'll call you back shortly. Thank you!"
   ```
4. Voicemails will be sent to your email
5. Set up email notifications

#### 2.4 Test Call Recording

**For Quality Assurance**:
1. Enable call recording in agent settings
2. Recordings are saved for 30 days
3. Review regularly to improve agent prompts
4. **Privacy**: Add notice to greeting if required by law

---

### Step 3: Update Agent Prompt for Production

Your agent prompt should handle edge cases for real customers.

**Recommended Production Prompt**:

```
You are [Restaurant Name]'s AI reservation assistant. You handle phone calls professionally and efficiently.

GREETING:
"Thank you for calling [Restaurant Name]. This is our AI reservation assistant. How can I help you today?"

CORE CAPABILITIES:
1. Make reservations (date, time, party size, name, phone)
2. Check availability for specific dates/times
3. Look up existing reservations
4. Modify reservations
5. Cancel reservations
6. Answer questions about hours, location, menu

CONVERSATION GUIDELINES:
- Be warm, professional, and concise
- Speak clearly and at a moderate pace
- Confirm all details before creating reservation
- Always ask for phone number for confirmation
- If customer seems confused, offer to transfer to human (say "Let me transfer you to our staff")
- Handle interruptions gracefully
- Don't make assumptions - ask clarifying questions

REQUIRED INFORMATION FOR RESERVATIONS:
1. Date (confirm: "Just to confirm, that's [day of week], [month] [date], correct?")
2. Time (use 12-hour format with AM/PM)
3. Party size (number of guests)
4. Customer name (ask: "May I have a name for the reservation?")
5. Phone number (ask: "What's the best phone number to reach you?")

CONFIRMATION FORMAT:
"Perfect! I have you down for [party size] guests on [day], [date] at [time] under the name [name]. We'll send a confirmation to [phone]. Is there anything else I can help you with today?"

ERROR HANDLING:
- If webhook fails: "I'm having trouble accessing our reservation system. Let me transfer you to our staff who can help you directly."
- If date/time unavailable: "I don't see availability at that time. We have openings at [alternative times]. Would any of those work for you?"
- If customer unclear: "I want to make sure I get this right. Could you please repeat [the information]?"

CLOSING:
"Thank you for calling [Restaurant Name]. We look forward to seeing you! Have a great day."

TRANSFER PHRASES (if customer asks for human):
"Of course, let me transfer you to our staff. One moment please."

HOURS:
Monday-Thursday: 5:00 PM - 10:00 PM
Friday-Saturday: 5:00 PM - 11:00 PM
Sunday: 5:00 PM - 9:00 PM

LOCATION:
[Your Address]
[Parking instructions if applicable]

DO NOT:
- Make promises about specific tables or views
- Discuss pricing unless asked
- Share personal opinions about menu items
- Process payments over the phone
- Share other customers' information
```

**How to Update**:
1. Go to ElevenLabs agent settings
2. Click "System Prompt" or "Agent Instructions"
3. Replace with production prompt above
4. Customize with your restaurant details
5. Save and test

---

### Step 4: Configure Webhook URLs (Critical!)

Your webhook is already deployed at:
```
https://restaurant-ai-mcp.vercel.app/api/elevenlabs-webhook
```

**Verify it's working**:
```bash
curl "https://restaurant-ai-mcp.vercel.app/api/elevenlabs-webhook?action=get_current_datetime"
```

Should return current date/time.

**In ElevenLabs Dashboard**:
1. Go to agent → "Tools" tab
2. For each tool, verify webhook URL:
   - `create_reservation`: `https://restaurant-ai-mcp.vercel.app/api/elevenlabs-webhook?action=create_reservation`
   - `check_availability`: `https://restaurant-ai-mcp.vercel.app/api/elevenlabs-webhook?action=check_availability`
   - `lookup_reservation`: `https://restaurant-ai-mcp.vercel.app/api/elevenlabs-webhook?action=lookup_reservation`
   - `get_current_datetime`: `https://restaurant-ai-mcp.vercel.app/api/elevenlabs-webhook?action=get_current_datetime`

3. Test each webhook:
   - Click "Test" button
   - Provide sample parameters
   - Verify response is valid JSON

---

### Step 5: Concurrent Call Limits

**Important**: ElevenLabs has concurrent call limits based on your plan.

**Recommended Settings**:
- **Starter/Pro**: 1-3 concurrent calls
- **Enterprise**: 10+ concurrent calls

**What happens when limit reached?**
- New callers get busy signal OR
- Route to voicemail OR
- Queue system (if enabled)

**How to Set**:
1. In agent settings → "Phone" tab
2. Set "Max Concurrent Calls"
3. Configure overflow behavior:
   - Option 1: Send to voicemail
   - Option 2: Play "all agents busy" message
   - Option 3: Queue (hold music)

**Recommendation**: Start with 2-3 concurrent calls, monitor peak times, adjust as needed.

---

### Step 6: Add Phone Number to Your Website/Marketing

Once your number is live, promote it!

**Where to Display**:
1. **Website Header**: Click-to-call button
   ```html
   <a href="tel:+1234567890">📞 Call for Reservations</a>
   ```

2. **Google My Business**: Update phone number

3. **Social Media**: Add to bio/about section

4. **Email Signatures**: Include in staff signatures

5. **Print Materials**: Menus, business cards, flyers

**Sample Website Copy**:
```
📞 Call for Reservations: (123) 456-7890

Our AI assistant is available 24/7 to:
✅ Make reservations instantly
✅ Check availability in real-time
✅ Modify or cancel existing bookings
✅ Answer questions about our menu and hours

Prefer online? Book directly on our website!
```

---

### Step 7: Monitor & Optimize

#### 7.1 Check Call Logs Daily

**In ElevenLabs Dashboard**:
1. Go to "Conversational AI" → "History"
2. Review recent calls
3. Listen to recordings
4. Check for:
   - Failed reservations
   - Confused customers
   - Webhook errors
   - Long call durations (>5 min)

#### 7.2 Set Up Alerts

**Email Notifications**:
- Webhook failures
- Voicemails received
- High error rate
- System downtime

**How to Enable**:
1. ElevenLabs settings → "Notifications"
2. Enable email alerts
3. Add your email address
4. Choose notification types

#### 7.3 Weekly Review

**Every Monday**:
- Review call volume (how many calls?)
- Check success rate (how many reservations created?)
- Listen to 5-10 random calls for quality
- Update prompt based on common issues
- Check Vercel logs for webhook errors

#### 7.4 Monthly Optimization

**Review**:
- Total calls vs successful reservations (target: >80%)
- Average call duration (target: <3 min)
- Common failure points
- Customer feedback

**Optimize**:
- Refine prompt for clarity
- Add new tools if needed
- Adjust business hours
- Update FAQ responses

---

## 💰 Cost Breakdown (Example)

### Scenario: 100 calls/month, avg 3 min each

#### Option A: ElevenLabs Number
```
Phone number rental:     $15/month
Inbound call minutes:    100 calls × 3 min × $0.03 = $9
Text-to-Speech:          Included in plan
LLM processing:          Included (using ElevenLabs LLM)
---
Total:                   ~$24/month
```

#### Option B: Twilio + ElevenLabs
```
Twilio phone number:     $1/month
Twilio inbound:          300 min × $0.0085 = $2.55
ElevenLabs processing:   300 min × $0.03 = $9
---
Total:                   ~$12.55/month
```

**Recommendation**: Start with ElevenLabs managed number for simplicity. Switch to Twilio if you need more control or plan to scale significantly.

---

## 🧪 Testing Checklist

Before going live, test these scenarios:

### Basic Functionality
- [ ] Call the number - agent answers with greeting
- [ ] Make a reservation - confirm it appears in Airtable
- [ ] Check availability for a specific date/time
- [ ] Look up existing reservation by phone number
- [ ] Modify a reservation
- [ ] Cancel a reservation

### Edge Cases
- [ ] Call during after-hours - hear after-hours message
- [ ] Request invalid date (e.g., "yesterday")
- [ ] Request time outside business hours
- [ ] Provide unclear information - agent asks for clarification
- [ ] Say "transfer me to a person" - agent responds appropriately
- [ ] Hang up mid-call - call ends gracefully

### Error Handling
- [ ] Temporarily break webhook (change URL) - agent handles error
- [ ] Make 3+ concurrent calls - overflow works correctly
- [ ] Leave a voicemail - receive email notification
- [ ] Network latency test - agent remains responsive

---

## 🚨 Common Issues & Solutions

### Issue 1: Agent Not Answering Calls
**Symptoms**: Phone rings but no answer, or immediate busy signal

**Solutions**:
1. Check ElevenLabs agent status (active vs paused)
2. Verify phone number is correctly linked
3. Check concurrent call limit
4. Verify billing/credits

### Issue 2: Webhook Errors
**Symptoms**: Agent says "having trouble with reservation system"

**Solutions**:
1. Test webhook manually:
   ```bash
   curl "https://restaurant-ai-mcp.vercel.app/api/elevenlabs-webhook?action=get_current_datetime"
   ```
2. Check Vercel deployment status
3. Review Vercel logs for errors
4. Verify environment variables in Vercel

### Issue 3: Slow Response Time
**Symptoms**: Long pauses between customer speech and agent response

**Solutions**:
1. Switch to faster LLM model (already using GLM-4.5-Air ✅)
2. Optimize webhook response time
3. Check Vercel function execution time
4. Consider upgrading Vercel plan

### Issue 4: Agent Misunderstands Dates
**Symptoms**: Wrong dates in reservations

**Solutions**:
1. Update tool description to be more explicit
2. Add date confirmation step in prompt
3. Use `get_current_datetime` tool in every conversation
4. Add date validation in webhook

### Issue 5: High Call Costs
**Symptoms**: Unexpected bill

**Solutions**:
1. Set max call duration (10 min)
2. Add call timeout for silence
3. Monitor for spam/prank calls
4. Implement call rate limiting

---

## 📊 Success Metrics

Track these KPIs to measure success:

### Primary Metrics
- **Reservation Completion Rate**: >80% of calls result in confirmed reservation
- **Average Call Duration**: <3 minutes
- **Customer Satisfaction**: >4/5 stars (if collecting feedback)
- **Webhook Success Rate**: >99%

### Secondary Metrics
- **Call Volume**: Track daily/weekly trends
- **Peak Hours**: Identify busiest times
- **Abandoned Calls**: <5% hang up before completion
- **Transfer Rate**: <10% request human transfer

### Financial Metrics
- **Cost per Reservation**: Target <$0.50
- **Reservation Value**: Track average party size/revenue
- **ROI**: Compare to cost of staff answering phones

---

## 🔄 Production Launch Checklist

### Pre-Launch (Do These First)
- [ ] Test agent with 10+ realistic scenarios
- [ ] Verify all webhooks return valid responses
- [ ] Configure business hours and after-hours message
- [ ] Set up voicemail and email notifications
- [ ] Review and finalize agent prompt
- [ ] Test call recording
- [ ] Set concurrent call limits
- [ ] Configure overflow behavior

### Launch Day
- [ ] Make test call to verify everything works
- [ ] Update website with new phone number
- [ ] Update Google My Business
- [ ] Send announcement to existing customers (email)
- [ ] Post on social media
- [ ] Monitor first 10 calls closely

### First Week
- [ ] Review call logs daily
- [ ] Listen to all calls for quality assurance
- [ ] Fix any issues immediately
- [ ] Collect customer feedback
- [ ] Adjust prompt based on learnings

### Ongoing
- [ ] Weekly call log review
- [ ] Monthly optimization session
- [ ] Quarterly cost analysis
- [ ] Update prompt as menu/policies change

---

## 📞 Getting Help

### ElevenLabs Support
- **Documentation**: https://elevenlabs.io/docs/conversational-ai
- **Support Email**: support@elevenlabs.io
- **Discord Community**: https://discord.gg/elevenlabs

### Your Backend Issues
- Check Vercel logs: https://vercel.com/stefanogebaras-projects/restaurant-ai-mcp/logs
- Review CLAUDE.md for common issues
- Test webhooks with curl commands
- Check Airtable API status

---

## 🎯 Quick Start (TL;DR)

1. **Buy phone number** in ElevenLabs (5 min)
2. **Enable inbound calls** in agent settings (2 min)
3. **Set business hours** and after-hours message (3 min)
4. **Update agent prompt** with production version (10 min)
5. **Test 5-10 scenarios** to verify (15 min)
6. **Add number to website** and marketing (5 min)
7. **Monitor first week** closely

**Total time**: 30-45 minutes

---

**Ready to Go Live?**

Once you complete the checklist above, your AI phone agent will be live and ready to handle real customer calls 24/7! 🎉

**Next Steps**: After phone is live, proceed with Phase 3 (Waitlist, Customer Profiles, Analytics).
