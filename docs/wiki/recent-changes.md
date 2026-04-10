---
title: "Recent Changes"
slug: recent-changes
compiled_at: "2026-04-10T21:33:42.325Z"
---
# Recent Changes

## WhatsApp and Message Processing Improvements
The team has been focusing on enhancing the WAHA (self-hosted WhatsApp) adapter and message processing system. Key improvements include resolving local identifiers to real phone numbers (commit 511ef697), skipping group and newsletter messages to conserve AI tokens (a8f36c53), and improving message handling synchronization to prevent data loss, especially with Vercel deployments (56029c11).

## Multilingual and Demo Enhancements
A significant effort has been made to improve internationalization and demo experiences. The Makoto demo now supports Spanish locale with real restaurant information, interactive cancellation, and language-specific system prompts (commits 39975eba, 58bfaf60, a1ed95f9). The team has also been carefully managing language switching and translation, ensuring smooth user experiences across different locales.

## Project Documentation and Wiki
A new project wiki compiler has been developed with Obsidian integration (a3cbfb65), resulting in comprehensive documentation across multiple areas including active issues, API endpoints, architecture, and recent changes. The wiki compiler script (scripts/compile-project-wiki.js) represents a substantial addition to the project's documentation infrastructure.

## Development Patterns
The recent commit history reveals a consistent focus on:
- Bug fixes and performance improvements
- Internationalization support
- Debugging and logging enhancements
- Adapter and webhook optimizations

The current development seems concentrated on stabilizing the messaging system, improving multilingual support, and creating robust documentation for the project.
