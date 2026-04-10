---
title: "Recent Changes"
slug: recent-changes
compiled_at: "2026-04-10T21:20:31.649Z"
---
# Recent Changes

## WAHA WhatsApp Integration
The team is actively enhancing the WAHA (self-hosted WhatsApp) adapter, with recent commits focusing on message processing refinement. Developers are resolving LID identifiers to real phone numbers (commit 511ef697) and implementing logic to skip group/newsletter messages to optimize AI token usage (a8f36c53). The webhook and message processor (waha-webhook.js, waha-adapter.js) have undergone significant updates to improve async processing and logging.

## Internationalization and Localization Improvements
Recent work emphasizes multilingual support, particularly for the Makoto demo. Commits introduce Spanish locale support, with careful attention to system prompts, component translations, and language synchronization. The team has been fixing language-related issues in components like DemoManagerChat and ensuring robust fallback mechanisms (commits like 58bfaf60, 39975eba). Translation files (en.json, es.json, pt-BR.json) have been incrementally updated to support these changes.

## Demo and Dashboard Enhancements
The development team is iterating on demo experiences, with recent work targeting the Makoto restaurant demo. Key improvements include adding an interactive Madrid preset, implementing analytics sidebar panels, and refining the booking flow. Dashboard-related commits address authentication, API noise reduction, and token handling (e.g., b26e1ea1 which adds URL path parameter token reading).

## Ongoing Development Patterns
The commit history reveals a consistent focus on:
- Bug fixes and stability improvements
- Performance optimization
- Internationalization
- Expanding demo capabilities
- Debugging and logging enhancements

The current development trajectory suggests continued refinement of the platform's multilingual capabilities, WhatsApp integration, and demo experiences, with a strong emphasis on code quality and user experience.
