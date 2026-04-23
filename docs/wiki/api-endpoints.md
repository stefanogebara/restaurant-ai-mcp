---
title: "API Endpoints"
slug: api-endpoints
compiled_at: "2026-04-23T22:24:55.052Z"
---
# API Endpoints Overview

The system features over 90 distinct API endpoints, all following a consistent `/api/*` URL pattern. These serverless functions, primarily hosted on Vercel, provide comprehensive restaurant management and customer engagement capabilities. Each endpoint is designed as a modular, single-responsibility microservice handling specific functional requirements.

Authentication across endpoints follows a multi-tiered approach. Protected routes utilize JSON Web Token (JWT) middleware, requiring restaurant-specific credentials. Public endpoints like `/api/customer-reservation` and `/api/portal` allow unauthenticated access, while sensitive management routes require explicit authentication. Certain background jobs leverage a `CRON_SECRET` for secure scheduled execution, preventing unauthorized trigger of time-sensitive operations.

The API can be logically segmented into key domain groups: Reservations (e.g., `/api/reservations`, `/api/check-availability`), Demo Management (`/api/demo`), AI-Powered Management (`/api/manager-notes`, `/api/ai-strategy`), Voice/ElevenLabs Integration (`/api/elevenlabs-webhook`), WhatsApp Communication (`/api/whatsapp-webhook`), Payments (`/api/stripe-webhook`), and Customer Portal (`/api/customer-portal`). Each group addresses specific operational needs with granular, focused endpoints.

Scheduled cron jobs run at precise intervals, handling background tasks like reservation reminders (every 15 minutes), daily analytics briefings, weekly reporting, and system maintenance. Critical jobs include late reservation checks, churn score updates, automated campaign management, and health monitoring. Jobs range from near-real-time (every 15 minutes) to daily scheduled tasks, ensuring continuous operational optimization.

When adding new endpoints, developers must adhere to established conventions: implement CORS protection, integrate rate limiting, define clear authentication requirements, use secure logging, and follow the existing modular serverless function pattern. Each endpoint should have a clear, single responsibility, handle error cases gracefully, and align with the existing authentication and logging infrastructure.
