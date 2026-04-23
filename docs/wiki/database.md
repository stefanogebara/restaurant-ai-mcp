---
title: "Database Schema"
slug: database
compiled_at: "2026-04-23T22:25:04.132Z"
---
# Database Architecture

## Platform and Infrastructure
The system leverages Supabase PostgreSQL with advanced features including Row Level Security (RLS) and pgvector for vector embeddings. The database is designed for a multi-tenant restaurant management platform, with a carefully structured schema that separates system-wide and restaurant-specific data.

## Schema Design
The database is split into two primary schemas: `public` and `restaurant`. The `public` schema hosts core operational tables like `reservations`, `tables`, `waitlist`, and `service_records`, each implemented with a `restaurant_id` to enable multi-tenant architecture. Each table uses Row Level Security to ensure data isolation, allowing only authorized access to specific restaurant's records.

## Key Operational Tables
Critical tables include `reservations` (customer bookings), `tables` (physical inventory), `waitlist` (queued customers), and `service_records` (active dining sessions). The `restaurant_config` table stores business-specific configurations like operating hours and timezone. Recently added tables such as `restaurant_wiki_pages` and `campaign_automations` expand the platform's collaborative and marketing capabilities.

## Multi-Tenancy and Security
Multi-tenancy is achieved through `restaurant_id` columns and RLS policies, ensuring strict data separation. Two primary Supabase clients are used: `supabaseAdmin` (service role with full access) and `supabaseClient` (anonymous user respecting access restrictions). Recent migrations have expanded functionality with new tables like `voice_experiments`, `customer_notes`, `coupons`, and `pos_connections`.

## Recent Enhancements
Recent database migrations demonstrate continuous platform evolution, adding features like WhatsApp integration (`whatsapp_test_messages`), CRM enhancements (`customer_ltv`, `customer_notes`), and automation tools (`campaign_automations`). The modular migration approach allows incremental feature development while maintaining robust database architecture.
