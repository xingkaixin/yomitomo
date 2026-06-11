# UI Primitive Boundary

## Decision

Yomitomo is migrating interactive UI primitives from Radix UI to Base UI.
Base UI is used as an unstyled behavior layer; existing CSS classes, theme
variables, and public wrapper names should remain stable unless a migration
issue explicitly scopes an API change.

Base UI is installed as the single tree-shakable React package:

```ts
import { Popover } from '@base-ui/react/popover';
```

Do not look for per-primitive packages. The project uses `@base-ui/react`
subpath imports so each wrapper imports only the primitive it needs.

## Ownership

- `apps/desktop/src/renderer/src/components/ui`: desktop renderer wrappers.
  These wrappers may use Tailwind classes, `cn`, `class-variance-authority`,
  desktop z-index variables, and AppTheme CSS variables.
- `packages/reader-ui/src/components/ui`: reader-ui wrappers. These wrappers
  must not depend on desktop renderer modules, Tailwind config, Electron, or
  desktop-only theme helpers.
- `apps/web`: the landing page should not receive Base UI by default. Add
  `@base-ui/react` there only when a web issue migrates a real interactive
  primitive, such as the landing discussion dialog.

## Migration Rules

- Business code should import local wrappers, not Base UI primitives directly,
  when the primitive is shared across more than one UI surface.
- A direct Base UI import is acceptable only for a single-use local primitive
  whose behavior is not expected to become part of the design system.
- Keep existing wrapper names when possible: `Select`, `Popover`, `Tooltip`,
  `Dialog`, `DropdownMenu`, `Button`, `Input`.
- Preserve existing CSS classes during migration. Behavior may move to Base UI;
  visual design should not change unless the issue explicitly says so.
- Do not add new `@radix-ui/*` imports. The only allowed Radix imports during
  the migration are the existing wrappers listed in `scripts/check-ui-primitives.mjs`.

## Current Radix Exceptions

These files are migration-only exceptions and must be removed by follow-up
issues:

- `apps/desktop/src/renderer/src/components/ui/popover.tsx` -> RD-591
- `apps/desktop/src/renderer/src/components/ui/select.tsx` -> RD-591
- `packages/reader-ui/src/components/ui/tooltip.tsx` -> RD-592

`apps/desktop/package.json` and `packages/reader-ui/package.json` may keep
their Radix dependencies until RD-597 removes the final leftovers.
