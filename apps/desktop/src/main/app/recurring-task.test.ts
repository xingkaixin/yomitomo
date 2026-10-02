import { expect, it } from '@effect/vitest';
import { Deferred, Effect, Exit, Fiber, Scope } from 'effect';
import { TestClock } from 'effect/testing';
import { recurringTaskEffect } from './recurring-task';

it.effect('waits between completed passes and releases the scoped task on shutdown', () =>
  Effect.gen(function* () {
    const reasons: string[] = [];
    const started = yield* Deferred.make<void>();
    const finish = yield* Deferred.make<void>();
    const scope = yield* Scope.make();
    const fiber = yield* Effect.forkIn(
      recurringTaskEffect({
        startupDelayMs: 10,
        intervalMs: 20,
        run: (reason) =>
          Effect.gen(function* () {
            reasons.push(reason);
            if (reason === 'startup') {
              yield* Deferred.succeed(started, undefined);
              yield* Deferred.await(finish);
            }
          }),
      }),
      scope,
    );

    yield* TestClock.adjust(9);
    expect(reasons).toEqual([]);
    yield* TestClock.adjust(1);
    yield* Deferred.await(started);
    yield* TestClock.adjust(100);
    expect(reasons).toEqual(['startup']);
    yield* Deferred.succeed(finish, undefined);
    yield* TestClock.adjust(20);
    expect(reasons).toEqual(['startup', 'interval']);

    yield* Scope.close(scope, Exit.void);
    yield* TestClock.adjust(100);
    expect(reasons).toEqual(['startup', 'interval']);
    expect(Exit.isFailure(yield* Fiber.await(fiber))).toBe(true);
  }),
);
