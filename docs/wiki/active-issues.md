---
title: "Active Issues & TODOs"
slug: active-issues
compiled_at: "2026-04-23T22:25:48.374Z"
---
# Active Issues in Codebase

## High Priority TODOs and Potential Risks

Several critical TODO markers indicate incomplete data handling and selection strategies, particularly in API endpoints. Notable locations include `agent-conversations.js` and `guest-feedback.js`, where developers are still using broad `select('*')` database queries instead of explicit column selection. This presents potential security and performance risks by potentially exposing unnecessary data. The `elevenlabs-webhook.js` also has an unresolved international phone number handling edge case that could impact caller identification.

## Recurring Bug Patterns and System Fragility

WhatsApp integration emerges as a consistently problematic subsystem, with multiple recent fixes addressing race conditions, cold-start retries, and webhook synchronization. Vercel Lambda timeouts and database connection issues have been frequent pain points, evidenced by multiple patches increasing timeout windows and implementing retry logic. Phone number and session management also appear brittle, with fixes related to environment variable parsing, JOIN query handling, and international format normalization.

## Cron Job Vulnerability Assessment

The extensive cron job ecosystem presents significant operational risk. Particularly concerning are time-sensitive jobs like reservation reminders, manager alerts, and data synchronization tasks running every 15-30 minutes. Jobs involving external API interactions (usage reporting, SEO cache warming) and complex data processing (churn scoring, analytics briefing) are most prone to silent failures. The high frequency of WhatsApp and conversation sync jobs (every 15 minutes) suggests potential load and consistency challenges.

## Recommended Developer Focus Areas

Prioritize refactoring the following subsystems:
1. WhatsApp webhook and message processing pipeline
2. Phone number validation and international format handling
3. Database query optimization, replacing broad selects with explicit column definitions
4. Cron job error handling and comprehensive logging
5. Vercel Lambda timeout and cold-start resilience strategies

Immediate technical debt items include implementing proper error boundaries in asynchronous processes, standardizing phone number parsing across `PhoneInput.tsx`, and adding more robust retry/recovery mechanisms in webhook handlers.

## Mitigation Strategies

Implement comprehensive logging, add explicit error tracking for cron jobs, and develop a centralized error reporting mechanism. Consider introducing circuit breakers for external API interactions and developing more granular timeout management for database and webhook operations.
