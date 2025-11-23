# Restaurant AI MCP - Production Readiness Plan

**Created**: November 22, 2025
**Status**: Pre-Launch Testing Phase
**Goal**: Ensure 100% reliability before going live

---

## 1. Voice & Language Strategy

### 1.1 Recommended Languages for Restaurant Industry

Based on global restaurant markets and ElevenLabs availability:

**Tier 1 - Launch Languages (High Priority)**
1. **English** (US, UK, Australian accents) - Global standard
2. **Spanish** - Major markets: Spain, Latin America, US Hispanic
3. **French** - France, Canada, Belgium, Switzerland
4. **Italian** - Italy, high-end dining markets
5. **German** - Germany, Austria, Switzerland
6. **Portuguese** - Brazil, Portugal

**Tier 2 - Expansion Languages (Medium Priority)**
7. **Chinese (Mandarin)** - China, Singapore, major cities
8. **Japanese** - Japan, sushi/ramen restaurants globally
9. **Arabic** - Middle East, high-end dining
10. **Hindi** - India, Indian restaurants globally

**Tier 3 - Niche Languages (Low Priority)**
11. **Dutch** - Netherlands, Belgium
12. **Polish** - Poland, Eastern European restaurants
13. **Turkish** - Turkey, Turkish restaurants
14. **Greek** - Greece, Greek restaurants

### 1.2 Voice Selection Criteria

For each language, we need:
- **Professional/Conversational tone** (not narrative or character voices)
- **Gender diversity**: Both male and female options
- **Age range**: Mature, trustworthy voices (25-45 years perceived age)
- **Clear articulation**: Restaurant environments are noisy
- **Warm personality**: Hospitality industry standard

### 1.3 Recommended Voice Additions

**Search Strategy in ElevenLabs:**
1. Go to Voice Library → Filters
2. Use Case: "Conversational" or "Conversational AI"
3. Language: Select target language
4. Sort by: "Trending" or "Most Used"
5. Look for: Professional descriptions (not character/animation)

**Target Voice Profiles Per Language:**
- **2 Male voices** (one warm/friendly, one professional/formal)
- **2 Female voices** (one warm/friendly, one professional/formal)
- **Total**: ~48 voices for 12 languages = manageable library

---

## 2. Complete Testing Matrix

### 2.1 Agent Conversation Tests (ElevenLabs)

#### A. Basic Reservation Flow Tests

**Test 1: Happy Path - Simple Reservation**
- **Scenario**: Customer calls, requests table for 2, today at 7 PM
- **Expected**: Agent checks date, checks availability, collects info, confirms
- **Verify**:
  - ✅ Uses get_current_datetime for "today"
  - ✅ Calls check_availability API
  - ✅ Collects name, phone (minimum)
  - ✅ Calls create_reservation with all fields
  - ✅ Confirms reservation with ID

**Test 2: Fully Booked - Offer Alternatives**
- **Scenario**: Request fully booked time (e.g., Saturday 7:30 PM)
- **Expected**: Agent says "fully booked", mentions table turnover, offers alternatives
- **Verify**:
  - ✅ Does NOT mention specific seat counts ("6 seats available")
  - ✅ Says "I'm sorry, but that time is fully booked"
  - ✅ Mentions "tables typically turn over every 90 minutes"
  - ✅ Offers alternative times WITHOUT seat counts

**Test 3: Modify Existing Reservation**
- **Scenario**: Customer has confirmation number, wants to change time
- **Expected**: Agent looks up reservation, confirms details, modifies
- **Verify**:
  - ✅ Calls lookup_reservation
  - ✅ Reads back current reservation details
  - ✅ Calls modify_reservation
  - ✅ Confirms new details

**Test 4: Cancel Reservation**
- **Scenario**: Customer wants to cancel
- **Expected**: Agent confirms identity, cancels politely
- **Verify**:
  - ✅ Asks for confirmation number or phone
  - ✅ Calls cancel_reservation
  - ✅ Confirms cancellation

**Test 5: Complex Inquiry - Multiple Questions**
- **Scenario**: "Do you have availability Friday? What about Saturday? Can we get a window seat?"
- **Expected**: Agent handles multiple questions gracefully
- **Verify**:
  - ✅ Checks both days sequentially
  - ✅ Notes special request (window seat)
  - ✅ Doesn't get confused by multiple requests

**Test 6: Unclear Customer Input**
- **Scenario**: Customer says "uh... maybe tomorrow... or Wednesday?"
- **Expected**: Agent clarifies politely
- **Verify**:
  - ✅ Asks clarifying question
  - ✅ Waits for clear answer before proceeding
  - ✅ Doesn't make assumptions

**Test 7: Special Requests**
- **Scenario**: "My wife has a severe peanut allergy"
- **Expected**: Agent notes in special_requests field
- **Verify**:
  - ✅ Acknowledges concern
  - ✅ Passes to special_requests parameter
  - ✅ Confirms it will be noted

#### B. Edge Case Tests

**Test 8: Same-Day Last Minute**
- **Scenario**: "I need a table for 6 in 30 minutes"
- **Expected**: Agent checks availability, handles urgency
- **Verify**:
  - ✅ Calculates "today" + time correctly
  - ✅ Responds to urgency appropriately

**Test 9: Far Future Booking**
- **Scenario**: "Can I book for New Year's Eve next year?"
- **Expected**: Agent attempts booking (if restaurant allows)
- **Verify**:
  - ✅ Calculates date correctly
  - ✅ API handles far-future dates

**Test 10: Interruption Mid-Flow**
- **Scenario**: Customer interrupts: "Wait, actually make it 4 people, not 2"
- **Expected**: Agent adapts to new information
- **Verify**:
  - ✅ Updates party_size before finalizing
  - ✅ Doesn't create reservation with wrong info

**Test 11: Phone Number Formats**
- **Scenario**: Various formats: "555-1234", "(555) 123-4567", "+1-555-123-4567"
- **Expected**: Agent accepts all formats
- **Verify**:
  - ✅ Doesn't reject valid phone formats
  - ✅ Passes phone to API as-is

**Test 12: No Email Provided**
- **Scenario**: Customer declines to provide email
- **Expected**: Agent proceeds without email (it's optional)
- **Verify**:
  - ✅ Creates reservation with empty email
  - ✅ Doesn't insist on email

#### C. Error Handling Tests

**Test 13: API Failure - Availability Check**
- **Scenario**: Manually trigger API 500 error
- **Expected**: Agent apologizes, suggests calling restaurant
- **Verify**:
  - ✅ Handles error gracefully
  - ✅ Doesn't expose technical details

**Test 14: Timeout - Slow API Response**
- **Scenario**: Add 10-second delay to API
- **Expected**: Agent waits or handles timeout
- **Verify**:
  - ✅ Doesn't hang indefinitely
  - ✅ Provides feedback to customer

**Test 15: Duplicate Reservation Attempt**
- **Scenario**: Same customer tries to book same time twice
- **Expected**: Agent detects and handles
- **Verify**:
  - ✅ API returns appropriate response
  - ✅ Agent communicates clearly

---

### 2.2 Platform Synchronization Tests

#### A. Real-Time Update Tests

**Test 16: Reservation → Dashboard**
- **Action**: Create reservation via AI agent
- **Verify**:
  - ✅ Reservation appears in calendar within 30 seconds
  - ✅ Shows correct date, time, party size
  - ✅ Shows ML risk score (if applicable)
  - ✅ Check-in button is available

**Test 17: Walk-In → Agent Awareness**
- **Action**: Add walk-in via dashboard (seats 10 people at 7 PM)
- **Action**: Call agent, request table for 2 at 7 PM
- **Verify**:
  - ✅ API availability check reflects reduced capacity
  - ✅ Agent accurately reports availability

**Test 18: Check-In → Table Assignment**
- **Action**: Check in reservation via dashboard
- **Action**: Assign tables to party
- **Verify**:
  - ✅ Tables marked as "Occupied"
  - ✅ Service record created
  - ✅ Stats update (occupancy %)

**Test 19: Complete Service → Availability**
- **Action**: Mark party as departed
- **Verify**:
  - ✅ Tables return to "Available"
  - ✅ Occupancy stats decrease
  - ✅ Agent can now book those tables

**Test 20: Manual Table Status Change**
- **Action**: Mark table as "Being Cleaned" manually
- **Verify**:
  - ✅ Agent excludes table from availability
  - ✅ Once marked "Available", agent includes it

#### B. Data Consistency Tests

**Test 21: Concurrent Reservations**
- **Action**: Two customers call simultaneously for last table
- **Verify**:
  - ✅ Only one reservation succeeds
  - ✅ Second customer gets "fully booked" message
  - ✅ No double-booking

**Test 22: Modification Conflicts**
- **Action**: Modify reservation via dashboard while customer is on phone
- **Verify**:
  - ✅ Agent gets latest data
  - ✅ No data race conditions

**Test 23: Cross-Device Sync**
- **Action**: Open dashboard on 2 devices (desktop + mobile)
- **Action**: Check in reservation on device 1
- **Verify**:
  - ✅ Device 2 updates within 30 seconds (polling)
  - ✅ Both show same state

---

### 2.3 Onboarding Flow Tests

#### A. Complete Onboarding Path

**Test 24: New Restaurant Signup - English**
- **Flow**:
  1. Go to `/onboarding`
  2. Enter restaurant name: "Test Bistro English"
  3. Select language: English
  4. Select voice: Professional female (e.g., "Sarah - Professional")
  5. Enter capacity: 40 seats, 8 tables
  6. Enter hours: Mon-Sun 5 PM - 10 PM
  7. Submit
- **Verify**:
  - ✅ Data saved to database/localStorage
  - ✅ Redirects to dashboard
  - ✅ Dashboard shows correct capacity
  - ✅ Agent uses selected voice (test call)

**Test 25: New Restaurant Signup - French**
- **Flow**: Same as Test 24, but:
  - Language: French
  - Voice: French male (e.g., "Guillaume - French voice")
  - Restaurant name: "Le Petit Bistro"
- **Verify**:
  - ✅ Dashboard displays in French (if i18n implemented)
  - ✅ Agent speaks French
  - ✅ SMS/Email use French templates

**Test 26: New Restaurant Signup - Spanish**
- **Flow**: Same as Test 24, but:
  - Language: Spanish
  - Voice: Spanish female
  - Restaurant name: "Casa de Tapas"
- **Verify**:
  - ✅ Agent speaks Spanish
  - ✅ Handles Spanish customer names correctly

#### B. Onboarding Validation

**Test 27: Invalid Inputs**
- **Action**: Leave required fields empty
- **Verify**:
  - ✅ Shows validation errors
  - ✅ Prevents submission
  - ✅ Highlights missing fields

**Test 28: Capacity Limits**
- **Action**: Enter unrealistic values (e.g., 1000 seats, 500 tables)
- **Verify**:
  - ✅ Accepts or warns appropriately
  - ✅ Doesn't break system

**Test 29: Voice Preview**
- **Action**: Play voice sample before selecting
- **Verify**:
  - ✅ Sample plays correctly
  - ✅ Represents actual agent voice

---

### 2.4 Production Environment Tests

#### A. Restaurant Profile Tests

**Test 30: Small Restaurant (20 seats)**
- **Profile**:
  - Name: "Cozy Corner Café"
  - Capacity: 20 seats, 5 tables
  - Language: English
  - Hours: 8 AM - 3 PM (breakfast/lunch only)
- **Tests**:
  - ✅ Create 8 reservations (near capacity)
  - ✅ Check availability returns accurate results
  - ✅ Dashboard shows correct occupancy
  - ✅ Complete service flow

**Test 31: Medium Restaurant (60 seats)**
- **Profile**:
  - Name: "Midtown Grill"
  - Capacity: 60 seats, 12 tables
  - Language: English
  - Hours: 11 AM - 11 PM
- **Tests**:
  - ✅ Create 20 reservations across lunch/dinner
  - ✅ Mix of reservations + walk-ins
  - ✅ Test peak hour (7-9 PM)

**Test 32: Large Restaurant (100+ seats)**
- **Profile**:
  - Name: "Grand Dining Hall"
  - Capacity: 120 seats, 30 tables
  - Language: French
  - Hours: 5 PM - 11 PM
- **Tests**:
  - ✅ Create 40 reservations
  - ✅ Multiple simultaneous check-ins
  - ✅ Complex table assignments

**Test 33: International Restaurant (Multi-language)**
- **Profile**:
  - Name: "Global Fusion"
  - Primary Language: English
  - Secondary: Spanish, Italian
  - Test switching languages
- **Tests**:
  - ✅ Agent handles English calls
  - ✅ Can optionally handle Spanish (if multi-language enabled)

---

### 2.5 Performance & Load Tests

**Test 34: High Volume Calls**
- **Action**: Simulate 10 simultaneous calls (use ElevenLabs test feature)
- **Verify**:
  - ✅ All calls handled without delays
  - ✅ No API rate limiting errors

**Test 35: Database Stress**
- **Action**: Create 100 reservations rapidly
- **Verify**:
  - ✅ All reservations saved correctly
  - ✅ Dashboard loads without lag
  - ✅ Agent queries remain fast (<2s)

**Test 36: Long Running Session**
- **Action**: Keep dashboard open for 2 hours
- **Verify**:
  - ✅ Polling continues working
  - ✅ No memory leaks
  - ✅ Stats remain accurate

---

### 2.6 ML & Advanced Features Tests

**Test 37: No-Show Risk Prediction**
- **Action**: Create reservation with high-risk indicators
  - New customer (no history)
  - Large party (8 people)
  - Booked 3 weeks in advance
  - Prime time (Saturday 8 PM)
- **Verify**:
  - ✅ ML model calculates risk score
  - ✅ Risk level displayed in dashboard
  - ✅ Intervention recommendation shows

**Test 38: Returning Customer Recognition**
- **Action**: Same customer makes 3rd reservation
- **Verify**:
  - ✅ System recognizes customer (email/phone match)
  - ✅ Lower risk score (good history)
  - ✅ Visit count incremented

**Test 39: ML Model Accuracy Tracking**
- **Action**: Check completed reservations
- **Verify**:
  - ✅ Actual outcome logged (showed up / no-show)
  - ✅ Model accuracy calculated over time
  - ✅ ROI tracking updated

---

## 3. Testing Schedule & Execution Plan

### Week 1: Core Functionality (Days 1-7)

**Day 1-2: Voice Setup**
- [ ] Research and select 48 voices (12 languages × 4 voices)
- [ ] Add voices to ElevenLabs library
- [ ] Test voice quality for each language

**Day 3-4: Agent Conversation Tests**
- [ ] Execute Tests 1-15 (Basic flow + Edge cases + Errors)
- [ ] Document any failures
- [ ] Fix issues found

**Day 5-6: Platform Sync Tests**
- [ ] Execute Tests 16-23 (Real-time updates + Data consistency)
- [ ] Verify 30-second polling works
- [ ] Fix any sync issues

**Day 7: Review & Fixes**
- [ ] Review all failed tests
- [ ] Implement fixes
- [ ] Re-test failures

### Week 2: User Experience (Days 8-14)

**Day 8-9: Onboarding Tests**
- [ ] Execute Tests 24-29 (Onboarding flows + Validation)
- [ ] Test with all 12 languages
- [ ] Fix UI/UX issues

**Day 10-12: Production Profile Tests**
- [ ] Execute Tests 30-33 (Small/Medium/Large restaurants)
- [ ] Simulate real-world usage patterns
- [ ] Collect performance metrics

**Day 13-14: Performance Tests**
- [ ] Execute Tests 34-36 (Load + Stress)
- [ ] Monitor API response times
- [ ] Optimize slow queries

### Week 3: Advanced Features & Polish (Days 15-21)

**Day 15-16: ML Feature Tests**
- [ ] Execute Tests 37-39 (No-show prediction + ROI)
- [ ] Verify ML model accuracy
- [ ] Test intervention workflows

**Day 17-18: End-to-End User Journeys**
- [ ] Complete user journey: Onboarding → Reservations → Service → Analytics
- [ ] Test with real phone calls (not just text chat)
- [ ] Invite beta testers (friends/family restaurants)

**Day 19-20: Bug Fixes & Polish**
- [ ] Fix all critical bugs
- [ ] Improve error messages
- [ ] Enhance UI responsiveness

**Day 21: Final Review & Go/No-Go Decision**
- [ ] Review all test results
- [ ] Calculate success rate (Target: >95% pass rate)
- [ ] Make go-live decision

---

## 4. Success Criteria

### Must-Have (Blockers for Launch)
- ✅ **99%+ agent conversation success rate** (Tests 1-15)
- ✅ **Real-time sync working** (<30s delay, Tests 16-20)
- ✅ **No data corruption** (Tests 21-23)
- ✅ **Onboarding completes successfully** (Tests 24-26)
- ✅ **No critical bugs** in production profiles (Tests 30-33)

### Should-Have (Launch with caveats)
- ✅ **Multi-language support** (English + 2 others minimum)
- ✅ **ML predictions working** (Tests 37-39)
- ✅ **Performance acceptable** (<2s API responses, Tests 34-36)

### Nice-to-Have (Post-launch)
- ⏸️ **All 12 languages supported**
- ⏸️ **Advanced analytics dashboard**
- ⏸️ **Email marketing integrations**

---

## 5. Risk Mitigation

### High-Risk Areas

**1. ElevenLabs API Reliability**
- **Risk**: API downtime during customer calls
- **Mitigation**:
  - Implement retry logic
  - Fallback to text-only mode
  - Monitor ElevenLabs status page

**2. Database Concurrency**
- **Risk**: Double-booking during high traffic
- **Mitigation**:
  - Use database transactions
  - Implement row-level locking
  - Add conflict detection

**3. Multilingual Quality**
- **Risk**: Poor translations or unnatural voices
- **Mitigation**:
  - Native speaker review for each language
  - Test with real customers
  - Allow restaurant to preview/change voices

**4. No-Show ML Model Accuracy**
- **Risk**: Inaccurate predictions hurt trust
- **Mitigation**:
  - Clearly label as "suggestions" not "guarantees"
  - Track accuracy over time
  - Allow manual override

---

## 6. Deployment Checklist

### Pre-Launch (T-7 days)
- [ ] All Tier 1 languages tested
- [ ] Production database backed up
- [ ] Monitoring alerts configured
- [ ] Support documentation written
- [ ] Beta testers onboarded (3-5 restaurants)

### Launch Day (T-0)
- [ ] Final smoke tests
- [ ] Monitor error rates (target: <1%)
- [ ] On-call engineer available
- [ ] Rollback plan ready

### Post-Launch (T+7 days)
- [ ] Collect user feedback
- [ ] Analyze conversation logs
- [ ] Review ML prediction accuracy
- [ ] Plan next iteration

---

## 7. Appendix: Voice Selection Guide

### How to Add Voices from ElevenLabs

**Step 1: Navigate to Voice Library**
```
https://elevenlabs.io/app/voice-library?use_cases=conversational
```

**Step 2: Filter by Language**
- Click "Filters"
- Select language (e.g., "French")
- Use Case: "Conversational AI" or "Conversational"
- Sort: "Trending" or "Most Used"

**Step 3: Preview & Select**
- Listen to voice samples
- Look for professional descriptions (avoid "character", "animation")
- Check language support (some voices support multiple languages)

**Step 4: Add to Library**
- Click "Add to My Voices"
- Rename for clarity (e.g., "French_Male_Professional_Guillaume")

**Step 5: Test in Agent**
- Go to Agent configuration
- Select new voice
- Make test call

**Recommended Searches**:
- **English**: "professional", "conversational", "customer service"
- **French**: "professionnel", "accueil", "réceptionniste"
- **Spanish**: "profesional", "atención al cliente"
- **Italian**: "professionale", "accogliente"
- **German**: "professionell", "kundenservice"

---

## 8. Next Steps

**Immediate (This Week)**:
1. ✅ Review this plan
2. ⏳ Add multilingual voices to ElevenLabs
3. ⏳ Update onboarding with language/voice selection
4. ⏳ Begin Week 1 testing schedule

**Short-Term (Next 2 Weeks)**:
5. Execute full test matrix
6. Fix all critical bugs
7. Conduct beta testing

**Medium-Term (Next Month)**:
8. Launch to first 10 paying customers
9. Iterate based on feedback
10. Expand to Tier 2 languages

---

**Document Owner**: Restaurant AI MCP Team
**Last Updated**: November 22, 2025
**Next Review**: After completing Week 1 tests
