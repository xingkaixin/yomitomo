# Renderer state boundary

## Decision

Business code in the desktop renderer, `packages/reader-ui`, and `apps/web` does
not call `useState`, `useEffect`, `useLayoutEffect`, or `useInsertionEffect`.
oxlint enforces this with `no-restricted-imports` and `no-restricted-properties`
in the root `.oxlintrc.json`. Import React as a default import; a namespace
import (`import * as React`) fails `no-restricted-imports`.

Test files are exempt. Files that still use these hooks are listed in the
exemption override of `.oxlintrc.json`. A migration removes its files from that
list; new code never adds to it.

## State ownership

| State | Owner |
| --- | --- |
| Local UI state of one component or hook | `useReducer` |
| State the renderer changes locally and shares across components: desktop store, articles, session navigation, theme, app lock, assistant runs, reader session | zustand |
| Read-only IPC data driven by UI parameters such as page or search query | TanStack Query |
| Values computable from props or other state | computed during render |

Each piece of data has one owner. Do not copy zustand state into a query or a
query result into zustand.

## Rules

- Group related local state in one reducer. Name actions after what happened
  (`queryChanged`, `opened`), not after the field they set. Do not add a generic
  `useState` replacement.
- State that must change when another value changes belongs in the reducer
  transition or action that changes that value, not in an effect.
- Read the latest props inside callbacks with `useEffectEvent`. Do not write
  `ref.current` during render.
- Attach element listeners, observers, focus, and measurement with ref callbacks
  that return a cleanup function. When DOM work must follow a data change, attach
  the ref to an element whose `key` changes with that data.
- Commands from main, such as menu commands, call store actions directly. Do not
  store a command in state for an effect to consume.
- Create zustand stores with a factory and provide them through React context, so
  tests get a fresh store and each opened reader gets its own session store.

## Electron windows

Each window loads its initial data and subscribes to main-process push events in
its startup module before React renders. Subscriptions update zustand actions or
the query cache; components only read. In development, the startup module
disposes its subscriptions through `import.meta.hot.dispose`.

Each window has its own stores and query client. Cross-window consistency comes
only from main-process broadcasts such as `article:patched`; do not synchronize
renderer stores between windows directly.

The query client defaults to `networkMode: 'always'`, `refetchOnWindowFocus:
false`, and `retry: false`. IPC does not depend on `navigator.onLine`, focusing
one of several windows must not repeat IPC reads, and most IPC failures are not
transient. Locking the app clears the query cache together with the locked
renderer store.

## Effect allowlist

Only these primitives may call `useEffect` or `useLayoutEffect`. Each is added
with its first caller and listed in the `.oxlintrc.json` allowlist override.

- `useEventListener(target, type, handler)` in reader-ui: window or document
  events scoped to a mounted view, such as reader keyboard shortcuts.
- `useInterval(callback, delay)` in reader-ui: timers that run while a state
  lasts. A `null` delay stops the timer.
- `useDesktopEvent(subscribe, handler)` in the desktop renderer: push events that
  only matter to a mounted view, such as revealing a passage in the open reader.

`useWindowSize` reads window size through `useSyncExternalStore` and needs no
effect.
