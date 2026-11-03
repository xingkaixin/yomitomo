import { describe, expect, it } from 'vitest';
import { buildAgentRecord } from '../agents/agent-repository';

describe('desktop store agents', () => {
  it('preserves existing agent fields on partial updates', () => {
    const created = buildAgentRecord(
      {
        kind: 'review',
        providerId: 'provider_1',
        nickname: 'Reviewer',
        username: 'reviewer',
        enabled: false,
        annotationDensity: 'low',
        temperature: 0.25,
      },
      {
        agents: [],
        providers: [],
      },
      '2026-05-16T00:00:00.000Z',
    );
    const updated = buildAgentRecord(
      { id: created.id, nickname: 'Updated Reviewer' },
      {
        agents: [created],
        providers: [],
      },
      '2026-05-16T01:00:00.000Z',
    );

    expect(updated).toMatchObject({
      id: created.id,
      kind: 'review',
      providerId: 'provider_1',
      nickname: 'Updated Reviewer',
      username: 'reviewer',
      enabled: false,
      annotationDensity: 'low',
      temperature: 0.25,
    });
  });
});
