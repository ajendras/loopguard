# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-11-12

### Added

- Live Agent Socket — Agents connect via Socket.io; every proposed BrowserAction is forwarded for review
- Action Preview — Glass cards display URL, intent, extracted PII and LLM-generated plain-English summary
- One-Click Approvals — Approve, deny, or escalate with optional one-time policy override
- Policy Engine — Configurable rules (domain lists, action types, risk thresholds) evaluated in real time
- Audit Trail — Immutable log of every proposal, decision and final outcome; exportable as JSON/CSV
- Example Agent SDK — Tiny TypeScript wrapper that works with Playwright, Puppeteer or raw fetch
- Dashboard UI — Responsive glassmorphic interface with live feed, connected agents list and history
- Instant Notifications — Browser and optional sound alerts for high-risk actions
- Session Replay — Re-play an agent's full decision timeline with timestamps
