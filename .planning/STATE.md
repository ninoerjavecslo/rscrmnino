# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-24)

**Core value:** Agency operators can see every project, invoice, cost, and pipeline deal in one place — so nothing falls through the cracks and revenue is always predictable.
**Current focus:** Phase 1 — Database Foundation + RLS

## Current Position

Phase: 1 of 4 (Database Foundation + RLS)
Plan: 0 of 3 in current phase
Status: Ready to plan
Last activity: 2026-04-24 — v2.0 roadmap created (4 phases, 16 requirements mapped)

Progress: ░░░░░░░░░░ 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: —
- Trend: —

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Roadmap: Use `organization_id` everywhere — never `org_id` — to avoid SQL bugs and broken FK references
- Roadmap: RLS is ENABLED (default-deny, no policies) in Phase 1 — this is safe because no policies exist yet so all rows are blocked. Enforcement policies are written in Phase 3 AFTER backfill completes.
- Roadmap: Zero Zustand store changes needed — RLS + JWT claim handles all scoping automatically
- Roadmap: Must deploy to Vercel (Cloudflare Pages does not support wildcard custom domain SSL as of April 2026)

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 1: Exact table count needs verification before writing migration checklist (research says 14+, codebase may differ — confirm with `\dt` in Supabase SQL editor)
- Phase 1: `organization_members.role` reconciliation with existing `user_permissions` store — resolve before writing Phase 1 migration
- Phase 2: Vercel wildcard DNS setup for `*.insighty.io` is a deploy-time dependency, not code — needs platform configuration before Phase 2 goes live

## Session Continuity

Last session: 2026-04-24
Stopped at: Roadmap created — ready to plan Phase 1
Resume file: None
