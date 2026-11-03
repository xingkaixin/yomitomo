import { describe, expect, it } from 'vitest';
import type { Agent } from '@yomitomo/shared';
import { publicAnnotationAgents } from '../source/bookcase/source-public-agents';

function desktopAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent_desktop',
    kind: 'annotation',
    presetId: 'lin',
    enabled: true,
    providerId: 'provider_1',
    nickname: 'lin',
    username: 'lin',
    avatar: '',
    annotationColor: '#8a8f4f',
    annotationDensity: 'medium',
    temperature: 0.4,
    soul: '',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('publicAnnotationAgents', () => {
  it('filters disabled annotation agents by default', () => {
    const enabled = desktopAgent({ id: 'agent_enabled', username: 'enabled', enabled: true });
    const disabled = desktopAgent({ id: 'agent_disabled', username: 'disabled', enabled: false });

    expect(publicAnnotationAgents([enabled, disabled]).map((item) => item.username)).toEqual([
      'enabled',
    ]);
    expect(
      publicAnnotationAgents([enabled, disabled], undefined, { includeDisabled: true }).map(
        (item) => item.username,
      ),
    ).toEqual(['enabled', 'disabled']);
  });
});
