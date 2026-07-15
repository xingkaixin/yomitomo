import { Cause, Effect, Exit, Fiber } from 'effect';
import { describe, expect, it } from 'vitest';

describe('Effect v4 runtime semantics', () => {
  it('aborts callback work and runs its cleanup when interrupted', async () => {
    const registration = deferredPromise();
    let aborts = 0;
    let cleanups = 0;
    const fiber = Effect.runFork(
      Effect.callback<never>((_resume, signal) => {
        signal.addEventListener('abort', () => aborts++, { once: true });
        registration.resolve();
        return Effect.sync(() => cleanups++);
      }),
    );

    await registration.promise;
    await Effect.runPromise(Fiber.interrupt(fiber));
    const exit = await Effect.runPromise(Fiber.await(fiber));

    expect(aborts).toBe(1);
    expect(cleanups).toBe(1);
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(Cause.hasInterrupts(exit.cause)).toBe(true);
    }
  });

  it('does not run interruption cleanup after callback success', async () => {
    let cleanups = 0;
    const result = await Effect.runPromise(
      Effect.callback<number>((resume) => {
        resume(Effect.succeed(42));
        return Effect.sync(() => cleanups++);
      }),
    );

    expect(result).toBe(42);
    expect(cleanups).toBe(0);
  });

  it('starts child fibers synchronously only when requested', async () => {
    const observations = await Effect.runPromise(
      Effect.gen(function* () {
        let deferredStarted = false;
        const deferredFiber = yield* Effect.forkChild(
          Effect.sync(() => {
            deferredStarted = true;
          }),
        );
        const deferredObserved = deferredStarted;
        yield* Fiber.join(deferredFiber);

        let immediateStarted = false;
        const immediateFiber = yield* Effect.forkChild(
          Effect.sync(() => {
            immediateStarted = true;
          }),
          { startImmediately: true },
        );
        const immediateObserved = immediateStarted;
        yield* Fiber.join(immediateFiber);

        return { deferredObserved, immediateObserved };
      }),
    );

    expect(observations).toEqual({ deferredObserved: false, immediateObserved: true });
  });

  it('distinguishes typed failures, defects, and interruptions', async () => {
    const failureExit = await Effect.runPromiseExit(Effect.fail('expected'));
    const defectExit = await Effect.runPromiseExit(Effect.die('unexpected'));
    const interruptionFiber = Effect.runFork(Effect.callback<never>(() => undefined));
    await Effect.runPromise(Fiber.interrupt(interruptionFiber));
    const interruptionExit = await Effect.runPromise(Fiber.await(interruptionFiber));

    expect(Exit.isFailure(failureExit)).toBe(true);
    expect(Exit.isFailure(defectExit)).toBe(true);
    expect(Exit.isFailure(interruptionExit)).toBe(true);
    if (Exit.isFailure(failureExit)) {
      expect(Cause.hasFails(failureExit.cause)).toBe(true);
      expect(Cause.hasDies(failureExit.cause)).toBe(false);
      expect(Cause.hasInterrupts(failureExit.cause)).toBe(false);
    }
    if (Exit.isFailure(defectExit)) {
      expect(Cause.hasFails(defectExit.cause)).toBe(false);
      expect(Cause.hasDies(defectExit.cause)).toBe(true);
      expect(Cause.hasInterrupts(defectExit.cause)).toBe(false);
    }
    if (Exit.isFailure(interruptionExit)) {
      expect(Cause.hasFails(interruptionExit.cause)).toBe(false);
      expect(Cause.hasDies(interruptionExit.cause)).toBe(false);
      expect(Cause.hasInterrupts(interruptionExit.cause)).toBe(true);
    }
  });
});

function deferredPromise(): { promise: Promise<void>; resolve: () => void } {
  let resolve = () => {};
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}
