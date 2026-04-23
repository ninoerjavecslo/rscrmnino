# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-24)

**Core value:** Agency operators can see every project, invoice, cost, and pipeline deal in one place — so nothing falls through the cracks and revenue is always predictable.
**Current focus:** Starting v2.0 SaaS milestone

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Ready to plan
Last activity: 2026-04-24 — v2.0 requirements defined (16 requirements, 4 categories)

Progress: ░░░░░░░░░░ 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: —
- Total execution time: —

## Accumulated Context

- Existing codebase is a mature single-tenant agency tool (~45 views, ~20 stores)
- Auth already exists but no multi-org isolation — all Supabase tables are unscoped
- Plan: add `organizations` table + `organization_id` FK to all tables + Supabase RLS policies
- Subdomain routing: wildcard DNS + slug resolution at app boot → set org context in Zustand
- Renderspace's existing data needs migration to their new org record
- Owner admin console: separate `/admin` route, visible only to Nino's account, shows all orgs/usage/billing
