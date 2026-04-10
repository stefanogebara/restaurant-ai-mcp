---
title: "Architecture Overview"
slug: architecture
compiled_at: "2026-04-10T21:20:20.992Z"
---
# Seatable Architecture Overview

Seatable is an AI-powered restaurant management platform that revolutionizes restaurant reservation and customer engagement through advanced voice, WhatsApp, and web interfaces. The platform enables restaurants to manage bookings, communicate with guests, and leverage AI-driven insights across their entire customer interaction lifecycle.

## Core Technology Stack
The project is built on a modern serverless architecture using Next.js, Vercel, Supabase, and TypeScript. Key dependencies include OpenAI for AI interactions, Elevenlabs for voice generation, WhatsApp Business API, and machine learning libraries like XGBoost for predictive modeling. The frontend uses React with Tailwind CSS, while the backend leverages serverless functions and a PostgreSQL database with Row Level Security (RLS) for multi-tenant data isolation.

## Project Structure
The project is organized into distinct directories reflecting its modular architecture. The `api/` directory contains serverless functions and core logic, with subdirectories like `cron/` for scheduled tasks, `services/` for business logic, and `ml/` for machine learning components. The `client/src/` directory follows a standard React project structure with components, pages, and utilities. Critical infrastructure is managed through directories like `database/migrations/` for database schema evolution and `e2e/` for end-to-end testing.

## Multi-Tenancy and Data Isolation
Seatable implements a robust multi-tenant model using Supabase's Row Level Security. Each restaurant is scoped by a `restaurant_id`, ensuring data isolation and secure access. Database migrations in `database/migrations/` systematically add columns and implement access controls, with files like `20260306_restaurant_members.sql` defining the membership and access patterns.

## Architectural Patterns
The platform employs serverless functions for scalable, event-driven architecture. Key patterns include the Manager AI (implemented in `api/_lib/manager-agent.js`), which provides conversational interfaces for restaurant managers, and a comprehensive demo provisioning system. Cron jobs in `api/cron/` handle background tasks like analytics generation, campaign management, and automated communication.

## Testing and Quality Assurance
Seatable maintains rigorous testing practices with 89 backend test files using Jest and 52 frontend test files using Vitest and React Testing Library. The `e2e/` directory contains Playwright tests covering critical user journeys, with comprehensive screenshot-based auditing in `playwright-report/`. Machine learning models are validated through synthetic data generation and feature importance analysis documented in `ml_models/` and `ml-training/`.
