# CALON BRAND LOCK — Visual Identity Source of Truth

**Status:** LOCKED (2026-04-06)
**Sprint:** BRAND-SOURCE-OF-TRUTH-AUDIT-01
**Class:** BRAND DECISION RECORD

---

## Primary Color

**`--primary` CSS token = Calon brand primary.**

The exact HSL value is defined in `apps/web/app/globals.css` under the `:root` block.
No hardcoded `purple-*` Tailwind class should be used as a substitute for `bg-primary`,
`text-primary`, or `border-primary` — token usage is the single source of truth.

Current token resolves to a purple/violet hue.
This is locked as the brand primary across all surfaces.

### Usage

| Surface | Usage |
|---------|-------|
| Logo badge | `bg-primary` |
| Nav CTA button | `bg-primary` |
| Hero CTA button | `bg-primary` |
| Final CTA button | `bg-primary` |
| Eyebrow badge | `border-purple-200/60 bg-purple-50/60` (light) + dark equivalents — explicit because eyebrow is a decorative pill, not an interactive element |
| Section labels (eyebrow text) | `text-primary/70` — token-based, no explicit `dark:text-purple-*` override |
| Value icon containers | `bg-primary/10` — token-based |
| Value icons | `text-primary` — token-based |
| Featured card ring | `ring-purple-300/20 dark:ring-purple-600/20` — explicit, decorative highlight |
| Admin active nav | `bg-primary/10 text-primary` |
| Backoffice active nav | `bg-primary/10 text-primary` |

---

## Accent Color

**Amber / warm orange = hover micro-accent only.**

Amber has no brand source. It was introduced as a subtle interaction hint and accepted
for the following narrow use cases:

| Use case | Class |
|----------|-------|
| Card hover border | `hover:border-amber-300/40 dark:hover:border-amber-600/30` |
| CTA hover shadow | `hover:shadow-amber-500/10` |

Amber is **forbidden** from:
- Ambient glow / orb backgrounds
- Primary accent roles (CTA bg, badge bg, icon fill)
- Section backgrounds
- Section label text
- Any static (non-hover) visible element

---

## Background Palette

Dark mode section backgrounds use explicit HSL values for section separation.
These are intentional design decisions, not design system defaults.

| Token | Light | Dark (explicit HSL) |
|-------|-------|---------------------|
| Page root | `bg-background` | `hsl(224 50% 4%)` |
| Alternate section A | `bg-background` | `hsl(224 50% 5%)` |
| Alternate section B | `bg-muted/30` | `hsl(224 45% 7%)` |
| Card surface | `bg-card` | `hsl(224 40% 9%)` |
| Card border | `border-border/50` | `hsl(224 30% 16%)` |

---

## Typography

Fluid type via CSS `clamp()` — no Tailwind fixed text-* sizes for landing headings.

| Element | clamp() value |
|---------|---------------|
| H1 | `clamp(2.5rem, 5vw + 1rem, 4.5rem)` |
| Section H2 | `clamp(1.75rem, 3vw + 0.5rem, 3rem)` |
| Lead / description | `clamp(1.125rem, 1.5vw + 0.5rem, 1.5rem)` |

---

## Shell Container

```
max-w-[1440px] 2xl:max-w-[1600px] px-6 sm:px-8 lg:px-12
```

Narrow centered sections (final CTA, etc.):
```
max-w-3xl lg:max-w-4xl
```

---

## Forbidden Patterns

The following patterns are locked as forbidden after BRAND-SOURCE-OF-TRUTH-AUDIT-01:

1. `bg-amber-*/text-amber-*/border-amber-*` in any static non-hover context
2. `dark:text-purple-400` as explicit override where `text-primary` token suffices
3. `dark:bg-purple-900/40` as explicit override where `bg-primary/10` suffices
4. Amber ambient glow orbs in hero or any section background
5. Amber as CTA or badge background

---

## What Has No Brand Source

The following were proposed during iterative design sessions but have no brief or brand origin:
- Amber as primary accent (briefly promoted, then corrected)
- Any teal/cyan accent
- Gradient hero backgrounds using warm colors

These must not be reintroduced without a new explicit brand decision recorded in this file.

---

## Change Protocol

Any modification to brand primary or accent requires:
1. Update this file with rationale
2. Update `globals.css` token if the primary HSL changes
3. Global find-replace audit across all surfaces (landing, backoffice, superadmin)
4. Commit tagged with `BRAND-*` sprint prefix
