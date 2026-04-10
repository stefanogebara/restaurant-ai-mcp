---
title: "Active Issues & TODOs"
slug: active-issues
compiled_at: "2026-04-10T21:21:00.479Z"
---
# Active Issues in Project

## Open TODOs and Critical Technical Debt

High-Priority TODOs involve database query safety and ID generation. Multiple files (`agent-conversations.js`, `guest-feedback.js`, `twilio-sms-webhook.js`) are using `select('*')` instead of explicit column selection, which creates potential security and performance risks. The secure ID generation in `_lib/secure-id.js` uses predictable reservation ID formats (RES-YYYYMMDD-XXXX), which might benefit from additional entropy or validation.

## Recent Bug Fix Patterns

Language internationalization (i18n) and rendering consistency have been recurring challenges. Recent fixes clustered around Spanish language support, React rendering synchronization, and preventing locale-related crashes. AI response quality and system prompts also required multiple interventions, suggesting fragility in multilingual AI interaction frameworks.

## Cron Job Risk Assessment

Several time-sensitive crons present potential silent failure modes:
- Hourly sync jobs (`sync-conversation-data`, `validate-conversations`) run every 15 minutes
- Critical daily jobs like `check-late-reservations` and marketing automation crons lack explicit error handling
- Manager alert crons with complex timing (e.g., late cancellation alerts at multiple daily intervals) increase complexity

## Development Focus Recommendations

Prioritize:
1. Comprehensive error logging for cron jobs
2. Explicit column selection in database queries
3. Internationalization test coverage
4. Standardize system prompt generation
5. Enhance secure ID generation entropy

Potential architecture improvements include introducing more robust i18n middleware, implementing circuit breakers for AI interactions, and creating centralized cron monitoring.
