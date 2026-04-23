# Requirements: Agency Intelligence OS

**Defined:** 2026-04-24
**Core Value:** Agency operators can see every project, invoice, cost, and pipeline deal in one place — so nothing falls through the cracks and revenue is always predictable.

## v2.0 Requirements

Requirements for the SaaS conversion milestone. Each maps to roadmap phases.

### Multi-tenancy

- [ ] **MT-01**: Each agency has an organization record with a unique slug, name, plan, and status
- [ ] **MT-02**: All data tables have an `organization_id` foreign key linking rows to their organization
- [ ] **MT-03**: Supabase RLS policies restrict all table access to the authenticated user's organization
- [ ] **MT-04**: Users are linked to organizations via an `organization_members` table with a role field

### Routing

- [ ] **RT-01**: App resolves the active organization from the subdomain at load time (e.g., `renderspace.insighty.io` → org "renderspace")
- [ ] **RT-02**: Organization context (org_id, name, slug) is injected into all Supabase store queries so every fetch is scoped to the active org

### Auth

- [ ] **AUTH-01**: Login is scoped to the organization determined by the current subdomain
- [ ] **AUTH-02**: Supabase session includes `org_id` for RLS policy enforcement (via JWT custom claims or `set_config` session context)

### Migration

- [ ] **MIG-01**: A SQL migration script creates the Renderspace organization and backfills `organization_id` on all existing data tables
- [ ] **MIG-02**: Existing Renderspace users are linked to the Renderspace org in `organization_members`

### Admin Console

- [ ] **ADM-01**: A `/admin` route is accessible only to the owner account (Nino — nino.erjavec@renderspace.si)
- [ ] **ADM-02**: Admin can view all organizations with slug, plan, status, and member count
- [ ] **ADM-03**: Admin can create new organizations with name and slug
- [ ] **ADM-04**: Admin can suspend or reactivate organizations
- [ ] **ADM-05**: Admin can manually set an organization's plan (free / trial / paid)
- [ ] **ADM-06**: Admin can impersonate any organization (switch app context for support/debugging without re-authenticating)

## Future Requirements

### Onboarding

- **ONB-01**: Agencies can self-register via a public signup page (pick subdomain, create account)
- **ONB-02**: Email invitation flow for adding team members to an org

### Billing

- **BILL-01**: Stripe subscription integration (automated billing per plan tier)
- **BILL-02**: Usage-based billing (per-seat or per-feature metering)

### Auth

- **AUTH-03**: SSO / OAuth login (Google, Microsoft)
- **AUTH-04**: Per-org custom email domain for auth

## Out of Scope

| Feature | Reason |
|---------|--------|
| Self-serve signup | Invite-only rollout for v2.0; manual provisioning via admin console |
| Stripe integration | Manual billing sufficient for initial SaaS customers |
| White-labelling | Not planned |
| Native mobile app | Web-first |
| Real-time collaboration | Single active user per org for now |
| User invitation flow | Deferred to future milestone |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| MT-01 | Phase 1 | Pending |
| MT-02 | Phase 1 | Pending |
| MT-03 | Phase 1 | Pending |
| MT-04 | Phase 1 | Pending |
| AUTH-02 | Phase 1 | Pending |
| RT-01 | Phase 2 | Pending |
| RT-02 | Phase 2 | Pending |
| AUTH-01 | Phase 2 | Pending |
| MIG-01 | Phase 3 | Pending |
| MIG-02 | Phase 3 | Pending |
| ADM-01 | Phase 4 | Pending |
| ADM-02 | Phase 4 | Pending |
| ADM-03 | Phase 4 | Pending |
| ADM-04 | Phase 4 | Pending |
| ADM-05 | Phase 4 | Pending |
| ADM-06 | Phase 4 | Pending |

**Coverage:**
- v2.0 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-24*
*Last updated: 2026-04-24 — traceability updated after ROADMAP.md creation*
