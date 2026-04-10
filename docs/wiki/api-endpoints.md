---
title: "API Endpoints"
slug: api-endpoints
compiled_at: "2026-04-10T21:20:41.944Z"
---
# API Endpoints Overview

The platform features over 80 distinct API endpoints, all following a consistent `/api/*` URL pattern hosted on a Vercel serverless infrastructure. These endpoints provide comprehensive restaurant management, customer engagement, and AI-powered interactions across multiple domains.

Authentication varies by endpoint, with most using JWT middleware for protected routes. Public endpoints like `/api/portal` and `/api/customer-reservation` allow unauthenticated access, while admin routes such as `/api/manager-preferences` and `/api/ai-strategy` require restaurant-level authentication. Cron jobs utilize a `CRON_SECRET` for secure scheduled execution, preventing unauthorized triggers.

The API ecosystem is organized into several key domain groups: Reservations (e.g., `/api/reservations`, `/api/check-availability`), Customer Management (e.g., `/api/customer-dna`, `/api/guest-profile`), Demo & Onboarding (e.g., `/api/demo`, `/api/scrape-restaurant`), AI-powered Interactions (e.g., `/api/elevenlabs-agent-create`, `/api/manager-chat`), Communication Channels (WhatsApp, SMS via `/api/twilio-*`), and Payment Integration (Stripe webhooks at `/api/stripe-webhook`).

Cron jobs run at precise intervals, handling critical background tasks. Key schedules include hourly reservation checks, daily churn score updates, weekly profile refreshes, and frequent campaign and conversation data synchronization. Notable jobs include `/api/cron/send-reminders` at 9 AM, `/api/cron/manager-briefings` at morning and evening, and `/api/cron/send-campaigns` every 15 minutes.

When adding new endpoints, developers should follow platform conventions: implement CORS protection, add rate limiting, use appropriate authentication middleware, integrate with secure logging, and follow the existing `/api/{domain}/{action}` naming structure. Each endpoint should have clear input validation, error handling, and adhere to the platform's security and performance standards.
