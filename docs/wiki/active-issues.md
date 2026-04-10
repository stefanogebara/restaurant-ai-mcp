---
title: "Active Issues & TODOs"
slug: active-issues
compiled_at: "2026-04-10T21:33:53.750Z"
---
# Active Issues and Development Focus

## TODO and FIXME Tracking

High-priority TODOs center around database query patterns and ID generation. Multiple files (`agent-conversations.js`, `guest-feedback.js`, `twilio-sms-webhook.js`) contain `select('*')` warnings requiring explicit column selection. The secure ID generation in `_lib/secure-id.js` uses consistent reservation/service ID formats (RES-YYYYMMDD-XXXX) but lacks comprehensive validation. Phone number input validation in `PhoneInput.tsx` shows complex international regex patterns that may need comprehensive testing.

## Recurring Bug Patterns

Recent fixes reveal consistent challenges in internationalization (i18n), language handling, and system prompt generation. Multiple commits addressed Spanish language support, system prompt localization, and preventing render/loading issues. Performance and timeout problems appear frequently, with recent fixes increasing routing timeframes from 8 to 20 seconds. AI response quality and token management also emerge as persistent development challenges.

## Cron Job Risks

Critical cron jobs with potential silent failure include time-sensitive operations like reservation checks, manager briefings, and analytics processing. Particularly high-risk jobs run at fixed intervals:
- Every 15 minutes: Late reservation checks, campaign synchronization
- Daily morning/evening jobs: Manager briefings, health alerts
- Analytics and sync jobs risk incomplete data processing if they encounter unexpected errors

## Development Focus Recommendations

1. Implement comprehensive error handling and logging for cron jobs
2. Complete database query column explicit selection
3. Enhance internationalization test coverage
4. Standardize AI prompt generation and token management
5. Review and optimize system timeout configurations

Immediate technical debt requires addressing query safety, internationalization robustness, and ensuring predictable background job performance.
