# Renderer state boundary

## Decision

Business code in the desktop renderer, `packages/reader-ui`, and `apps/web` does
not call `useState`, `useEffect`, `useLayoutEffect`, or `useInsertionEffect`.
oxlint enforces this with `no-restricted-imports` and `no-restricted-properties`
in the root `.oxlintrc.json`. Import React as a default import; a namespace
import (`import * as React`) fails `no-restricted-imports`.

Test files are exempt. Production code has no other exemptions; effects go
through the primitives in the effect allowlist below.

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

The main window creates its stores in `apps/desktop/src/renderer/src/main.tsx`:
the desktop store from `apps/desktop/src/renderer/src/shell/app-desktop-store.tsx`,
the session store from `apps/desktop/src/renderer/src/shell/app-session.tsx`, the
theme store from `apps/desktop/src/renderer/src/theme/use-reader-theme-controller.tsx`,
and the settings draft store from `apps/desktop/src/renderer/src/settings/app-settings-drafts.tsx`.
Push subscriptions and reactions between these stores, such as resetting the
session on lock, syncing theme and UI language from settings, opening the update
dialog when update status changes, or resetting settings drafts when a sync
snapshot arrives, live in
`apps/desktop/src/renderer/src/shell/app-desktop-event-bindings.ts`.

Annotation windows create their store and bind its subscriptions in
`apps/desktop/src/renderer/src/annotation-discussion/app-annotation-discussion-window-store.tsx`
and
`apps/desktop/src/renderer/src/annotation-discussion/app-annotation-sedimentation-window-store.tsx`;
`main.tsx` calls the window factory when the route selects that window.

Each window has its own stores and, if it reads through Query, its own query
client. Cross-window consistency comes
only from main-process broadcasts such as `article:patched`; do not synchronize
renderer stores between windows directly.

The main window creates its query client with
`apps/desktop/src/renderer/src/shell/app-query-client.ts`. The query client
defaults to `networkMode: 'always'`, `refetchOnWindowFocus:
false`, and `retry: false`. IPC does not depend on `navigator.onLine`, focusing
one of several windows must not repeat IPC reads, and most IPC failures are not
transient. Locking the app clears the query cache together with the locked
renderer store.

## Effect allowlist

Only these primitives may call `useEffect` or `useLayoutEffect`. Each is added
with its first caller and listed in the `.oxlintrc.json` allowlist override.

- `useEventListener(target, type, handler, options)` in reader-ui: window or
  document events scoped to a mounted view, such as reader keyboard shortcuts.
  A `null` target removes the listener.
- `useInterval(callback, delay)` in reader-ui: timers that run while a state
  lasts. A `null` delay stops the timer.
- `useDesktopEvent(subscribe, handler)` in the desktop renderer: push events that
  only matter to a mounted view, such as revealing a passage in the open reader.
- `useMountEffect(effect)` in reader-ui: work tied to a view's lifetime, such as
  showing the main window after the first commit or scheduling idle preloads. It
  takes no dependencies; work that follows a data change belongs in the action
  that changes the data.

`useWindowSize` reads window size through `useSyncExternalStore` and needs no
effect.
