---
title: "Database Schema"
slug: database
compiled_at: "2026-04-10T21:20:50.557Z"
---
# Database Architecture

Our platform leverages Supabase PostgreSQL with a sophisticated multi-tenant architecture designed for restaurant management and customer engagement. The database is built on PostgreSQL with Row Level Security (RLS) and pgvector support, enabling granular data access and advanced AI-powered features.

The database schema is strategically divided into two primary namespaces: `public` and `restaurant`. The `public` schema hosts core operational tables like `reservations`, `tables`, `waitlist`, and `service_records`, each containing a `restaurant_id` to ensure strict multi-tenancy. These tables track customer interactions, physical inventory, and active dining sessions. Complementary tables such as `customer_history` and `customer_ltv` provide comprehensive customer insights across restaurant ecosystems.

The `restaurant` schema contains configuration and advanced feature tables, including `restaurant_config` (business policies, hours, timezone), `restaurant_wiki_pages` (internal documentation), and recently added tables like `campaign_automations`, `api_keys`, and `webhook_subscriptions`. Recent migrations indicate expanding capabilities in CRM, AI personality configuration, event bookings, and communication automation.

Multi-tenancy is enforced through `restaurant_id` columns and robust Row Level Security policies. Two primary Supabase clients manage data access: `supabaseAdmin` (service role with unrestricted access) and `supabaseClient` (authenticated user with RLS-restricted permissions). This architecture ensures data isolation while enabling complex, restaurant-specific workflows.

Notable recent additions include AI-driven features like `voice_experiments`, expanded CRM capabilities with `customer_notes` and `customer_ltv` enhancements, and communication tools such as `campaign_automations` and `upsell_messages_log`. The platform continues to evolve, integrating advanced technologies like pgvector for potential AI and semantic search functionalities.
