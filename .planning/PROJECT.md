# Agency Intelligence OS

## What This Is

A full-featured agency management platform for digital agencies. It centralises client and project management, revenue planning and forecasting, sales pipeline, maintenance contracts, infrastructure and domain tracking, resource planning, and automated email reporting — all in one tool.

Currently used internally by Renderspace. Being converted into a SaaS product where multiple agencies can each have their own isolated workspace.

## Core Value

Agency operators can see every project, invoice, cost, and pipeline deal in one place — so nothing falls through the cracks and revenue is always predictable.

## Requirements

### Validated

<!-- All of these are shipped and in active use by Renderspace (v1.0 internal tool) -->

- ✓ **Client management** — CRUD clients, view client detail with linked projects/maintenances — v1.0
- ✓ **Project management** — fixed/maintenance/variable project types, stages, financials — v1.0
- ✓ **Revenue planning** — multi-month invoice planning with planned/issued/paid/retainer/cost statuses — v1.0
- ✓ **Forecasting** — pipeline + approved CRs projected into revenue forecast — v1.0
- ✓ **Sales pipeline** — Kanban pipeline, won-deal flow that creates projects/maintenances — v1.0
- ✓ **Maintenance contracts** — recurring contracts with hourly budgets and CR tracking — v1.0
- ✓ **Change requests** — three-stage workflow (pending → approved → confirmed) — v1.0
- ✓ **Infrastructure tracking** — hosting clients, provider costs, hosting revenue — v1.0
- ✓ **Domain tracking** — domain expiry monitoring, critical/warning alerts — v1.0
- ✓ **Resource planning** — team member allocation by project and month — v1.0
- ✓ **Timesheets** — team member time logging per project — v1.0
- ✓ **Automations** — scheduled email reporting rules — v1.0
- ✓ **Statistics** — revenue, project, client analytics — v1.0
- ✓ **Settings** — agency-wide configuration (rates, defaults, etc.) — v1.0
- ✓ **Role-based permissions** — ProtectedRoute with page-level permissions — v1.0

### Active

<!-- v2.0 SaaS — see Current Milestone below -->

- [ ] Organizations table with slug, name, plan, status
- [ ] organization_id FK on all data tables + Supabase RLS policies
- [ ] organization_members table linking users to orgs with roles
- [ ] Subdomain-based org resolution at app boot (renderspace.insighty.io → org context)
- [ ] Org context injected into all Zustand stores / Supabase queries
- [ ] Login scoped to subdomain org; org_id in Supabase session for RLS
- [ ] SQL migration: create Renderspace org + backfill all existing data
- [ ] /admin console: list orgs, create/suspend, assign plans, impersonate

## Current Milestone: v2.0 SaaS Conversion

**Goal:** Convert the single-tenant internal tool into a multi-tenant SaaS product on insighty.io

**Target features:**
- Multi-tenancy: organizations + RLS data isolation
- Subdomain routing (renderspace.insighty.io)
- Org-aware auth with RLS session context
- Data migration for Renderspace
- Owner admin console (/admin — Nino only)

### Out of Scope

- Native mobile app — web-first
- Real-time collaboration features — single active user per org for now
- White-labelling — not planned

## Context

- React 19 + TypeScript (strict) + Vite frontend
- Tailwind CSS v4 + shadcn/ui components + custom design-system.css
- Supabase backend (Postgres + Auth + Storage) — single project, single schema today
- Zustand v5 state management (~20 stores)
- React Router v7
- Currently single-tenant: all data belongs to one agency (Renderspace)
- Auth exists (LoginView + ProtectedRoute + permissions store), but no multi-org isolation
- Owner: Nino (nino.erjavec@renderspace.si)

## Constraints

- **Tech stack**: Must stay on Supabase — no migration to self-hosted Postgres
- **Single Supabase project**: Multi-tenancy via RLS + organization_id, not separate projects
- **Backwards compatibility**: Renderspace's existing data must migrate cleanly to the new org model
- **TypeScript strict**: TS6133 (unused vars) breaks the build — all code must be clean

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Single Supabase project for all tenants | Simpler ops, lower cost, RLS handles isolation | — Pending |
| Subdomain-per-tenant (e.g. renderspace.insighty.io) | Clean UX, org discovery at app boot | — Pending |
| organization_id FK on every table | Standard RLS multi-tenancy pattern | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-24 — GSD brownfield initialization (v1.0 baseline + SaaS milestone started)*
