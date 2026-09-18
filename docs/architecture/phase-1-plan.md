# Phase 1 Implementation Plan

## Goals

- Establish monorepo and shared contracts
- Define aerospace-specific data model in Prisma
- Implement authentication and RBAC foundations
- Ship a role-aware frontend shell with startup-grade UI direction
- Prepare infrastructure for later realtime, analytics, and AI modules

## Decisions

- `NestJS` is selected over Express for long-term module isolation, guards, interceptors, DTO validation, and websocket cohesion.
- `Auth.js` is selected for the Next.js layer to support credential and Google OAuth flows cleanly.
- `Prisma` owns the relational model with PostgreSQL as the source of truth.
- `Redis` is introduced early for sessions, caching, notifications, and future event fan-out.
- Shared contracts prevent frontend/backend drift in enums such as roles, statuses, and subsystem types.

## Deliverables

- Root workspace configs and local infrastructure
- Backend app skeleton with auth, tasks, analytics, ai, notifications, worklogs, calendar, and files modules
- Prisma schema covering the core domain
- Frontend app shell, navigation, protected pages, role dashboards, and sample widgets
- CI, Docker, env templates, and onboarding docs

## Deferred to Later Phases

- Persistent websocket event bus implementation
- Google Calendar and Drive live API integrations
- OpenAI background job execution
- Full CRUD surfaces across all domain modules
- Exhaustive test suite

