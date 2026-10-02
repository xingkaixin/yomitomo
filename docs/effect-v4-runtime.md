# Effect v4 Runtime Boundary

Pinned Effect version: `4.0.0`

Production Effect modules: `20`

Production API inventory: `Cause.hasInterrupts,Cause.squash,Deferred.Deferred,Deferred.await,Deferred.complete,Deferred.doneUnsafe,Deferred.make,Deferred.makeUnsafe,Deferred.succeed,Effect.Effect,Effect.Success,Effect.acquireUseRelease,Effect.all,Effect.callback,Effect.catch,Effect.delay,Effect.ensuring,Effect.fail,Effect.flatMap,Effect.fn,Effect.forEach,Effect.forkChild,Effect.forkIn,Effect.gen,Effect.map,Effect.mapError,Effect.onExit,Effect.promise,Effect.repeat,Effect.runFork,Effect.runPromise,Effect.runSync,Effect.sleep,Effect.succeed,Effect.sync,Effect.tapError,Effect.timeoutOption,Effect.timeoutOrElse,Effect.try,Effect.tryPromise,Effect.uninterruptible,Effect.void,Exit.isFailure,Exit.void,Fiber.Fiber,Fiber.await,Fiber.interrupt,Fiber.join,Option.getOrElse,Queue.make,Queue.offerUnsafe,Queue.shutdown,Queue.take,Schedule.spaced,Schema.Array,Schema.Constraint,Schema.Literal,Schema.Number,Schema.Record,Schema.String,Schema.Struct,Schema.Union,Schema.Unknown,Schema.decodeUnknownEffect,Schema.instanceOf,Schema.isGreaterThan,Schema.isInt,Schema.isLessThanOrEqualTo,Schema.optionalKey,Scope.Scope,Scope.close,Scope.makeUnsafe,Semaphore.make`

## Scope

The production inventory covers Effect imports under `apps/desktop/src`, `packages/ai/src`, and
`packages/core/src`. It describes APIs the repository actually uses; it is not a checklist of every
Effect v4 breaking change. AI runtime operations use direct Effect composition and named boundaries;
provider and models.dev HTTP boundaries decode unknown JSON with `Schema.decodeUnknownEffect` before
domain mapping.

WeRead library synchronization composes the client's Effect operations directly. Bounded detail
loading interrupts sibling requests on failure before the serialized snapshot queue advances;
only a complete authoritative response reaches persistence. The gateway envelope is decoded with
Schema before endpoint-specific validation and mapping.

Bilingual translation composes generation effects inside a bounded three-block workflow. Session
AbortSignals interrupt active provider requests and prevent queued blocks from starting. Expected
per-block failures remain isolated; segment writes already in progress finish before the session
queue advances to deletion. The public Promise API remains available for other callers.

Main-process recurring tasks belong to a Scope and use Schedule.spaced after each completed pass,
so slow work cannot overlap the next pass. The evidence projector uses a sliding one-item wakeup
queue: explicit requests preempt idle waits and coalesce while a batch runs. Shutdown interrupts
waits, joins in-flight database leases, and closes the queue. Persisted projection jobs, retry
timestamps, and database-generation checks remain authoritative. Schedule tests use TestClock via
the matching `@effect/vitest@4.0.0`; existing Promise-boundary tests retain their timer fixtures.

Embedding requests use Deferred responses and Effect timeouts. A single exit finalizer recycles
failed or interrupted workers and waits for the operating system's exit event before releasing
the busy slot. Disposal joins that same request fiber, including cancellation already in progress.
Worker responses are decoded with Schema before checking request identity, vector dimensions,
finite values, and normalization. Idle workers retain their bounded graceful-disposal handshake.

Semantic indexing owns its scheduled and active fibers in a Scope. Interruption aborts the embedding
call and joins native exit and database leases before a query, reset, or suspension proceeds.
Queries remain serialized; committed vectors, source snapshots, generation checks, and model
activation still govern recovery. Continuation batches use a positive timer delay so pauses and
queries can preempt the next batch, matching Node's previous zero-delay timer behavior.

The inventory includes root and subpath imports and the Schema, scheduling, scope, queue, layer,
runtime, and HTTP namespaces used by the staged runtime adoption.

## Runtime Semantics

The upgrade from `4.0.0-rc.113` to stable `4.0.0` preserves the APIs in the production inventory.
The source comparison covers `Effect`, `Cause`, `Exit`, `Fiber`, `Deferred`, `Semaphore`, and `Schema`.
The renamed Schema filters and changed `Effect.partition` result order are not used here.
`Effect.try` and `Effect.tryPromise` distinguish the direct callback overload from explicit
`{ try, catch }` error mapping. Existing callers already use the latter where typed errors are needed.
`Effect.acquireUseRelease` also runs the release action when the use callback throws synchronously.

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
| `Scope.close`, `Effect.forkIn`, `Schedule.spaced` | Closing a scope interrupts and joins its children; spaced repetition waits after completion. | Recurring tasks never overlap themselves, and shutdown waits for opaque operations to release database leases. | TestClock and main-process disposal tests cover timing and joining. |
| `Queue.make`, `Queue.take`, `Effect.timeoutOption` | A sliding capacity-one queue retains the latest pending request; timeout interrupts the waiting take. | Projection requests wake idle work and coalesce during a batch without replacing persisted job state. | Projection worker tests cover preemption, coalescing, database replacement, and disposal. |
| `Deferred.makeUnsafe`, `Deferred.doneUnsafe`, `Effect.timeoutOrElse`, `Effect.onExit`, `Fiber.await` | Callback boundaries can complete a Deferred directly; exit finalizers finish before a fiber's Exit is observable. | Embedding errors and cancellation recycle the child process exactly once; busy requests stay rejected until OS exit, and disposal joins pending cleanup. | Embedding service tests cover native exit, timeout, malformed IPC, graceful disposal, and disposal during cancellation. |
| `Effect.all`, `Effect.gen`, `Effect.try`, `Effect.catch`, `Effect.fail`, `Effect.succeed`, `Effect.sync`, `Effect.map`, `Effect.flatMap`, `Effect.mapError` | `Effect.catch` replaces `Effect.catchAll`; the remaining primitives have no repository-relevant v4 semantic change. | Keep explicit concurrency, composition, and typed error mapping at the call site. | Existing domain tests cover their behavior. |

The test-only inventory additionally uses `Cause.hasDies`, `Cause.hasFails`, `Cause.hasInterrupts`,
`Effect.die`, `Effect.runFork`, `Effect.runPromiseExit`, `Exit.isFailure`, `Fiber.await`,
`Fiber.interrupt`, and `Fiber.join` to observe v4 runtime behavior without relying on rejected Promise
shape.

## Upgrade Procedure

1. Update `apps/desktop/package.json`, `packages/ai/package.json`, and `packages/core/package.json` to
   the same exact v4 stable, beta, or rc version; ranges and dist-tags are not allowed.
2. Run `pnpm install --lockfile-only` and confirm `pnpm why effect -r` reports one version.
3. Diff the pinned package source for every API in the production inventory. Update the pinned
   version, module count, inventory, and semantic rows in this document before changing application
   code.
4. Run `pnpm effect:check`, focused runtime tests, and `mise run check`.

The gate rejects version drift, multiple lockfile resolutions, a stale documented inventory, and the
retired `Effect.async`, `Effect.catchAll`, `Effect.fork`, or `Effect.makeSemaphore` names.
