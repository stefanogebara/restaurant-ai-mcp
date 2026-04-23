---
title: "Architecture Overview"
slug: architecture
compiled_at: "2026-04-23T22:24:32.013Z"
---
# Seatable Architecture Overview

Seatable is an AI-powered restaurant management platform designed to streamline restaurant operations through intelligent reservation, communication, and analytics tools. The platform enables restaurants to manage bookings via voice, WhatsApp, and traditional channels while leveraging AI to enhance guest experiences and operational efficiency.

The technology stack is built on a modern serverless architecture, utilizing Supabase for database and authentication, React with TypeScript for the frontend, and Node.js for backend services. Key dependencies include OpenAI for language models, ElevenLabs for voice synthesis, and WhatsApp Business API for messaging. The project leverages a comprehensive microservices approach, with modular services organized in the `api/` directory across subdirectories like `services/`, `cron/`, and `ml/`.

Project structure follows a clear separation of concerns. The `client/src/` directory contains React components, hooks, and application logic, while the `api/` directory hosts server-side functionality. Critical architectural components include multi-tenant Row Level Security (RLS) in Supabase, ensuring that each restaurant can only access its own data through carefully scoped database queries. The `database/migrations/` directory tracks schema evolution, with each migration file representing incremental database changes.

Multi-tenancy is implemented through a `restaurant_id` foreign key pattern across all core tables, with Supabase RLS policies enforcing strict data isolation. Every database query and API endpoint incorporates restaurant-specific scoping, preventing cross-tenant data access. This approach allows seamless onboarding of new restaurants while maintaining robust data separation.

The architecture embraces serverless patterns, with most functionality implemented as lightweight, stateless functions. Cron jobs in the `api/cron/` directory handle background tasks like analytics generation, campaign management, and automated communications. The "Manager AI" is a sophisticated agent implemented in `api/_lib/manager-agent.js`, capable of generating insights, drafting communications, and providing predictive recommendations based on restaurant-specific data.

Testing is comprehensive, with 95 backend Jest tests and 52 frontend Vitest/React Testing Library test files. The `e2e/` directory contains Playwright integration tests covering critical user flows, authentication, and core functionality. Test coverage spans unit tests, integration tests, and end-to-end scenarios, ensuring robust validation of the platform's complex interactions between AI services, database operations, and user interfaces.
