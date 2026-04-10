---
title: "Architecture Overview"
slug: architecture
compiled_at: "2026-04-10T21:33:32.420Z"
---
# Seatable Architecture Overview

Seatable is an AI-powered restaurant management platform that revolutionizes restaurant reservation and communication systems through advanced voice, WhatsApp, and intelligent management technologies. The platform enables restaurants to streamline booking processes, enhance customer interactions, and leverage AI-driven insights across their operations.

## Technology Stack
The project employs a modern JavaScript/TypeScript ecosystem with Supabase as the primary backend infrastructure. Key technologies include Node.js for server-side logic, React with TypeScript for the frontend, and a serverless architecture powered by Vercel/Cloudflare functions. Critical dependencies include OpenAI for AI interactions, Elevenlabs for voice generation, WhatsApp Business API for messaging, and XGBoost for machine learning predictions. The tech stack emphasizes scalability, real-time capabilities, and seamless integration across communication channels.

## Project Structure
The project follows a modular architecture organized into distinct directories. The `api/` directory contains serverless functions and core business logic, with subdirectories like `_lib/` for shared utilities, `cron/` for scheduled tasks, and `services/` for complex business logic. The `client/src/` directory hosts the React frontend, structured with components, contexts, pages, and service layers. Specialized directories like `ml_models/` and `ml-training/` support machine learning model development and storage.

## Multi-Tenancy and Security
Seatable implements robust multi-tenancy through Supabase Row Level Security (RLS), with `restaurant_id` serving as the primary tenant identifier. Each database query and API endpoint is scoped to a specific restaurant, ensuring data isolation and security. The `_lib/auth.js` and database migration scripts (in `database/migrations/`) enforce strict tenant-based access controls, preventing cross-restaurant data leakage.

## Architectural Patterns
The platform leverages serverless functions for scalable, event-driven architectures, with key patterns including background job processing via cron tasks, AI-powered manager agents, and dynamic feature configuration. The `cron/` directory contains automated workflows like analytics briefings, campaign management, and reservation follow-ups. The Manager AI system (implemented in `_lib/manager-agent.js`) uses advanced prompting and context management to provide intelligent restaurant management recommendations.

## Testing and Quality Assurance
Seatable maintains comprehensive test coverage across backend and frontend codebases. The project uses Jest for backend testing (89 test files) and Vitest with React Testing Library for frontend validation (52 test files). Critical paths are covered by end-to-end Playwright tests in the `e2e/` directory, with specific test suites for authentication, booking flows, and complex user journeys. Continuous integration ensures that all code changes are rigorously validated before deployment.
