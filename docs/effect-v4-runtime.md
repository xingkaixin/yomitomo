# Effect v4 Runtime Boundary

Pinned Effect version: `4.0.0-beta.98`

Production Effect modules: `13`

Production API inventory: `Deferred.Deferred,Deferred.await,Deferred.complete,Deferred.make,Deferred.succeed,Effect.Effect,Effect.Success,Effect.acquireUseRelease,Effect.all,Effect.callback,Effect.catch,Effect.ensuring,Effect.fail,Effect.flatMap,Effect.fn,Effect.forkChild,Effect.gen,Effect.map,Effect.mapError,Effect.promise,Effect.runPromise,Effect.succeed,Effect.sync,Effect.try,Effect.tryPromise,Exit.isFailure,Fiber.join,Semaphore.make`

## Scope

The production inventory covers Effect imports under `apps/desktop/src`, `packages/ai/src`, and
`packages/core/src`. It describes APIs the repository actually uses; it is not a checklist of every
Effect v4 breaking change. AI runtime operations use direct Effect composition and named boundaries;
provider and models.dev HTTP boundaries decode unknown JSON with `Schema.decodeUnknownEffect` before
domain mapping.

## Runtime Semantics

| API | v3 to v4 boundary | Required repository behavior | Evidence |
| --- | --- | --- | --- |
| `Effect.tryPromise` | The `try` callback receives a runtime `AbortSignal`. | Raw fetch adapters combine it with timeout and business cancellation signals. AI SDK generation forwards it to the provider call. Rejecting promises use the typed error channel. | Adapter and AI provider interruption tests cover fetch cancellation. |
| `Effect.callback` | Replaces the retired `Effect.async` name and may return a cleanup Effect. | Worker listeners and termination are cleaned once; runtime interruption uses the supplied signal. | The callback semantic test covers interruption and completion; article import covers worker termination. |
| `Effect.forkChild` | Replaces `Effect.fork`; child startup is deferred unless `startImmediately: true` is set. | Image fetch children start immediately so the configured concurrency of four is real. | Runtime and bounded-concurrency tests cover deferred and immediate startup. |
| `Semaphore.make` | Replaces `Effect.makeSemaphore`. | Permits bracket image requests and are released after failure or interruption. | Image tests cover a failed batch reaching the final queued request. |
| `Deferred.make`, `Deferred.await`, `Deferred.succeed`, `Deferred.complete` | Deferred is no longer an Effect subtype. | Every wait and completion is explicit; commit turns always complete in an `ensuring` finalizer. | Image ordering, deduplication, and failure tests cover the coordination path. |
| `Fiber.join` | Fiber is no longer an Effect subtype. | Production code explicitly joins child image fibers before committing data. | Fiber startup and image concurrency tests cover this path. |
| `Effect.runPromise`, `Effect.runPromiseExit` | `runPromise` rejects with a squashed Cause; structured inspection requires an Exit. | Public Promise APIs use `runPromise`; package-internal workflows compose Effect operations directly. Semantic tests use `runPromiseExit` and v4 Cause guards. | AI composition tests assert the original tagged failure instead of a `FiberFailureImpl`. |
| `Cause.hasFails`, `Cause.hasDies`, `Cause.hasInterrupts`, `Exit.isFailure` | Cause is flattened; v3 Sequential and Parallel tree matching is retired. | Tests classify reasons through v4 guards only. | The runtime semantic suite covers all three reason classes. |
| `Effect.acquireUseRelease`, `Effect.ensuring` | Release remains guaranteed across success, failure, and interruption. | Timeout controllers, AI SDK streams, timers, response work, commit turns, and workers have one finalization path. | Adapter, assistant stream, and callback cleanup tests cover release behavior. |
| `Effect.fn` | Named operations add stable stack and trace boundaries. | Public and non-trivial AI workflows use domain-first operation names without introducing service layers. | AI runtime tests execute the named operations through their Effect-native exports. |
| `Effect.promise` | Rejection remains a defect rather than a typed failure. | It is limited to promises whose implementations absorb rejection; other Promise boundaries use `tryPromise`. | Article response cancellation absorbs errors; assistant tool rejection is asserted as a typed failure. |
| `Schema.decodeUnknownEffect` | Decoding reports `SchemaError` through the typed error channel. | HTTP JSON remains `unknown` until endpoint schemas validate consumed fields; schema failures map to domain response errors before business mapping or writes. | Provider model and models.dev tests cover malformed valid JSON and distinguish failures from defects. |
| `Effect.all`, `Effect.gen`, `Effect.try`, `Effect.catch`, `Effect.fail`, `Effect.succeed`, `Effect.sync`, `Effect.map`, `Effect.flatMap`, `Effect.mapError` | `Effect.catch` replaces `Effect.catchAll`; the remaining primitives have no repository-relevant v4 semantic change. | Keep explicit concurrency, composition, and typed error mapping at the call site. | Existing domain tests cover their behavior. |

The test-only inventory additionally uses `Cause.hasDies`, `Cause.hasFails`, `Cause.hasInterrupts`,
`Effect.die`, `Effect.runFork`, `Effect.runPromiseExit`, `Exit.isFailure`, `Fiber.await`,
`Fiber.interrupt`, and `Fiber.join` to observe v4 runtime behavior without relying on rejected Promise
shape.

## Upgrade Procedure

1. Update `apps/desktop/package.json`, `packages/ai/package.json`, and `packages/core/package.json` to
   the same exact `4.0.0-beta.x`; ranges and the `beta` dist-tag are not allowed.
2. Run `pnpm install --lockfile-only` and confirm `pnpm why effect -r` reports one version.
3. Diff the pinned package source for every API in the production inventory. Update the pinned
   version, module count, inventory, and semantic rows in this document before changing application
   code.
4. Run `pnpm effect:check`, focused runtime tests, and `mise run check`.

The gate rejects version drift, multiple lockfile resolutions, a stale documented inventory, and the
retired `Effect.async`, `Effect.catchAll`, `Effect.fork`, or `Effect.makeSemaphore` names.
