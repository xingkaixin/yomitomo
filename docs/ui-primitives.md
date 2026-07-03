# UI Primitive Boundary

## Decision

Yomitomo has retired Radix UI for interactive UI primitives. New primitive
behavior must use Base UI or local wrappers built on Base UI. The CI primitive
checker treats any Radix import, package dependency, or lockfile entry as a
failure.

Base UI is used as an unstyled behavior layer. Existing CSS classes, theme
variables, and public wrapper names should remain stable unless an issue
explicitly scopes an API change.

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
- Desktop renderer CSS ownership is documented in
  [Desktop Renderer Style Ownership](./desktop-style-ownership.md).
- `packages/reader-ui/src/components/ui`: reader-ui wrappers. These wrappers
  must not depend on desktop renderer modules, Tailwind config, Electron, or
  desktop-only theme helpers.
- `apps/web`: website interactions may use Base UI when a real interactive
  primitive needs it, such as the landing discussion dialog. Static landing
  content should not add primitive dependencies or desktop-only wrappers.

## Base UI Rules

- Business code should import local wrappers, not Base UI primitives directly,
  when the primitive already has a wrapper or is shared across more than one UI
  surface.
- A direct Base UI import is acceptable only for a single-use local primitive
  whose behavior is not expected to become part of the design system. If a
  second use appears, promote the behavior into the appropriate local wrapper.
- Keep existing wrapper names when possible: `Select`, `Popover`, `Tooltip`,
  `Dialog`, `DropdownMenu`, `Button`, `Input`.
- Preserve existing CSS classes when replacing primitive behavior. Visual design
  should not change unless the issue explicitly says so.

## Radix Status

There are no current Radix exceptions.

Do not add Radix imports, package dependencies, or lockfile references. Older
migration notes that allowed temporary wrapper or package exceptions are no
longer current. `pnpm ui:check-primitives` is the source of truth for this
boundary.
