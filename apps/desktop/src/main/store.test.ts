import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/yomitomo-store-test',
  },
}));

import { mergeSettingsForUpsert } from './store';

describe('desktop store settings', () => {
  it('preserves missing settings fields during partial upserts', () => {
    expect(
      mergeSettingsForUpsert(
        {
          defaultProviderId: undefined,
          readingAssistantProviderId: undefined,
          reviewAssistantProviderId: undefined,
          readingNoteProviderId: undefined,
          saveArticleImages: true,
        },
        {
          defaultProviderId: 'provider_1',
          readingAssistantProviderId: 'provider_1',
          reviewAssistantProviderId: 'provider_1',
          readingNoteProviderId: 'provider_1',
          messageSendShortcut: 'mod-enter',
          selectionActionShortcuts: { copy: 'X', annotate: 'B' },
          saveArticleImages: true,
          onboardingCompletedAt: '2026-05-12T00:00:00.000Z',
        },
      ),
    ).toEqual({
      defaultProviderId: undefined,
      readingAssistantProviderId: undefined,
      reviewAssistantProviderId: undefined,
      readingNoteProviderId: undefined,
      messageSendShortcut: 'mod-enter',
      selectionActionShortcuts: { copy: 'X', annotate: 'B' },
      saveArticleImages: true,
      onboardingCompletedAt: '2026-05-12T00:00:00.000Z',
    });
  });
});
