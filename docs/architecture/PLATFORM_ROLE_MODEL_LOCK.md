# PLATFORM ROLE MODEL — Architecture Decision Lock

**Status:** LOCKED (2026-04-06)
**Sprint:** SUPERADMIN-UNTITLED-02.1
**Class:** ARCHITECTURAL DECISION RECORD

---

## Current Model (WRONG)

```
User
└── UserTenant (role: UserRole, tenantId)
      └── JWT payload: { sub, tenantId, role, plan }
```

SUPER_ADMIN is stored as a UserTenant record with role=SUPER_ADMIN,
bound to a specific tenant (demo-salon in stage).

Login flow REQUIRES UserTenant lookup — platform admin cannot authenticate
without a tenant association.

JWT always carries tenantId, even for platform admin.

## Why This Is Wrong

1. **Platform admin is tenant-coupled.**
   SUPER_ADMIN login requires UserTenant record.
   JWT carries tenantId from that record.
   Platform admin "sees the world" through one tenant's lens.

2. **SUPPORT / SALES cannot exist in this model.**
   A SUPPORT user would need a UserTenant record — bound to which tenant?
   A SALES user viewing all tenants' billing would inherit one tenant's context.
   Platform roles cannot be tenant-scoped.

3. **Route-level fixes mask the problem.**
   Post-login redirect (SUPER_ADMIN → /admin) and dashboard guard
   (SUPER_ADMIN → redirect /admin) prevent surface crossing.
   But JWT truth is still tenant-bound. Backend endpoints receive tenantId.
   This is symptomatic treatment, not architectural correction.

4. **Impersonation is impossible.**
   Explicit tenant switch requires tenant-free base state.
   Current model has no tenant-free state for platform principals.

## Target Model (LOCKED)

```
User
├── platformRole?: SUPER_ADMIN | SUPPORT | SALES   (nullable)
└── tenants: UserTenant[]
        └── role: TENANT_OWNER | MANAGER | RECEPTIONIST | STAFF
```

### Login Flow (Target)
```
if (user.platformRole exists)
  → generate tenant-free JWT: { sub, role: platformRole, tenantId: null }
  → redirect: /admin

else
  → UserTenant lookup (existing flow)
  → generate tenant-bound JWT: { sub, tenantId, role, plan }
  → redirect: /calendar
```

### Guard Chain (Target)
```
TenantGuard:
  if isPlatformRole(role) → tenantId not required (partially exists today)
  else → tenantId required

AdminGuard:
  if isPlatformRole(role) → allow (with role-level permissions)
  else → 403

DashboardGuard:
  if isPlatformRole(role) → redirect /admin
  else → allow
```

### Admin Surface (Target)
```
Single admin shell with role-based nav visibility:
  SUPER_ADMIN → full access (all pages, all actions)
  SUPPORT     → tenants (read) + ops (read) + ticket queue
  SALES       → tenants (read) + billing (read) + plan management
```

## What Is Locked Now

- [ ] Three principal universes: Platform, Tenant, Customer
- [ ] Platform roles: SUPER_ADMIN, SUPPORT, SALES (minimum)
- [ ] Target: User.platformRole field (nullable enum)
- [ ] Target: tenant-free JWT for platform principals
- [ ] Target: AdminGuard with platform role array
- [ ] Target: single admin surface with role-based nav slice

## What Is Explicitly Deferred

These items are P1 ARCHITECTURAL debt. They will NOT be implemented
in the current sprint. They require a dedicated sprint with:
- Prisma schema migration (User.platformRole)
- Auth service login flow redesign
- JWT payload restructure
- AdminGuard expansion
- Dashboard guard platform-role expansion
- Wrong-role redirect platform-awareness
- Seed update for tenant-free admin user
- Stage + production migration

## What Is Forbidden In Current Sprint

- User.platformRole migration
- Auth token payload redesign
- AdminGuard platform role array
- Dashboard guard isPlatformRole expansion
- Wrong-role redirect platform-aware logic
- Explicit impersonation contract
- Subdomain split
- Middleware auth layer
- SUPPORT / SALES role implementation

## Dependencies Before Platform Role Implementation

1. Schema migration: add `platformRole` to User
2. Auth service: bifurcate login path (platform vs tenant)
3. JWT: conditional tenantId (null for platform)
4. TenantGuard: already partially supports (line 92 in tenant.guard.ts)
5. AdminGuard: expand to platform role array
6. Dashboard guard: expand to isPlatformRole check
7. Admin layout: role-based nav visibility
8. Seed: tenant-free admin user
9. Stage deploy + migration
10. Production deploy + migration
