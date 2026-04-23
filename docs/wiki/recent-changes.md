---
title: "Recent Changes"
slug: recent-changes
compiled_at: "2026-04-23T22:24:44.155Z"
---
# Recent Changes

The development team has been focusing on improving the WhatsApp communication system and weekly reporting features. Key improvements include more robust session management, diagnostic instrumentation, and enhanced messaging capabilities. The team has implemented atomic phone processing locks, improved error handling, and added diagnostic endpoints to trace session and PDF generation flows.

WhatsApp functionality has seen significant refinements, with commits addressing duplicate message prevention, session management, and conversational prompt improvements. Notable changes include dropping welcome buttons, implementing Supabase-backed deduplication, and adding fetch timeouts for restaurant configurations. The `keyword-handler.js` and `message-processor.js` files have been extensively modified to support more reliable message processing and routing.

Weekly reporting features have been expanded to allow user-configurable delivery days. Changes in `weekly-report.js` and `ManagerNotificationsPanel.tsx` enable more flexible report scheduling. The team has also improved input validation, with updates to `validation.js` and `demo.js` to better handle email and phone number formatting, including support for international phone number prefixes.

Diagnostic and monitoring capabilities have been enhanced with new endpoints like `/api/diag-pdf` and `/api/diag-session`, which provide deeper insights into system operations. The recent commits suggest a strong focus on improving system reliability, reducing error rates, and providing more granular observability of critical workflows.

The overall development pattern shows a mix of bug fixes, feature enhancements, and infrastructure improvements, with a particular emphasis on refining the WhatsApp communication system and weekly reporting mechanisms. Diagnostic instrumentation and error handling remain key priorities for the team.
