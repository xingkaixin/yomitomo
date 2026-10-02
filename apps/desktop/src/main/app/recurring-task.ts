import { Effect, Schedule } from 'effect';

export const recurringTaskEffect = Effect.fn('App.recurringTask')(function* (input: {
  startupDelayMs: number;
  intervalMs: number;
  run: (reason: 'startup' | 'interval') => Effect.Effect<void>;
}) {
  yield* Effect.sleep(input.startupDelayMs);
  yield* input.run('startup');
  yield* input
    .run('interval')
    .pipe(Effect.repeat(Schedule.spaced(input.intervalMs)), Effect.delay(input.intervalMs));
});
