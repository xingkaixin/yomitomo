import { describe, expect, it } from 'vitest';
import * as sharedPublicApi from './index';
import {
  agentPersonalities,
  agentReadingIntentDisplayLabel,
  createPdfTextAnchor,
  createTextAnchor,
  defaultSelectionActionShortcuts,
  resolveAgentPersonalityPresentation,
  resolveAgentPublicIdentity,
  resolvePromptAgentIdentity,
  normalizeSelectionActionShortcutDraft,
  normalizeSelectionActionShortcuts,
  normalizeTextWithMap,
  providerPresets,
  resolveTextAnchor,
  isPdfTextAnchor,
  selectionActionShortcutsConflict,
} from './index';

const sharedRuntimeExports = [
  'EPUB_TITLE_CLEANUP_VERSION',
  'agentPersonalities',
  'agentPersonalitiesForKind',
  'agentPersonalityCore',
  'agentPersonalityName',
  'agentPersonalityPresentations',
  'agentReadingIntentDisplayLabel',
  'agentReadingIntentIcon',
  'agentReadingIntentLabel',
  'agentReadingIntentOptions',
  'alphaColor',
  'annotationAgentPersonalities',
  'cleanEpubDisplayTitle',
  'cleanEpubFileNameTitle',
  'compareVersions',
  'createPdfTextAnchor',
  'createTextAnchor',
  'customPersonality',
  'customPersonalityId',
  'defaultAgentPersonalityLocale',
  'defaultAgentSoul',
  'defaultLibraryContentSourceOrder',
  'defaultMessageSendShortcut',
  'defaultSelectionActionShortcuts',
  'defaultUserAnnotationColor',
  'defaultUserProfile',
  'englishAgentPersonalityPresentations',
  'findAgentPersonalityId',
  'formatDateTimeValue',
  'hashText',
  'isPdfTextAnchor',
  'localizedAgentPersonalities',
  'localizedAgentPersonalitiesForKind',
  'localizedAgentPersonality',
  'makeId',
  'normalizeAgentReadingIntent',
  'normalizeAnnotationConfidence',
  'normalizeAnnotationEvidenceSource',
  'normalizeAnnotationMove',
  'normalizeAnnotationType',
  'normalizeAssistantExecutionMode',
  'normalizeLibraryContentSources',
  'normalizeMessageSendShortcut',
  'normalizeReviewOpinionLabel',
  'normalizeSelectionActionShortcutDraft',
  'normalizeSelectionActionShortcutKey',
  'normalizeSelectionActionShortcuts',
  'normalizeSoundEffectsVolume',
  'normalizeTextWithMap',
  'normalizeTraceItemType',
  'normalizeUiLanguage',
  'normalizeUserProfile',
  'providerPresets',
  'readingPartnerSoul',
  'relativeTimeParts',
  'resolveAgentPersonalityPresentation',
  'resolveAgentPresetId',
  'resolveAgentPublicIdentity',
  'resolvePromptAgentIdentity',
  'resolveTextAnchor',
  'reviewAgentPersonalities',
  'reviewOpinionLabelTone',
  'reviewOpinionLabels',
  'selectHighlights',
  'selectionActionShortcutsConflict',
  'shouldShowAfterUpdate',
  'textAnchorQuoteHash',
  'zhAgentPersonalityPresentations',
];

describe('shared public surface', () => {
  it('keeps runtime exports explicit and reviewed', () => {
    const runtimeExports = Object.keys(sharedPublicApi);

    expect(runtimeExports).toHaveLength(sharedRuntimeExports.length);
    expect(new Set(runtimeExports)).toEqual(new Set(sharedRuntimeExports));
  });
});

describe('shared text anchors', () => {
  it('uses the text-anchor whitespace mapping by default', () => {
    expect(normalizeTextWithMap(' a \t b ')).toEqual({ text: 'a b', map: [1, 4, 5] });
  });

  it.each([
    ['collapse-to-last-whitespace', 'a b', [1, 4, 5]],
    ['collapse-to-next-character', 'a b', [1, 5, 5]],
    ['remove', 'ab', [1, 5]],
  ] as const)('normalizes whitespace with %s mapping', (mode, text, map) => {
    expect(normalizeTextWithMap(' a \t b ', mode)).toEqual({ text, map });
  });

  it('resolves repeated exact text with prefix and suffix context', () => {
    const text = 'alpha target omega. beta target gamma.';
    const anchor = createTextAnchor(text, 25, 31);

    expect(resolveTextAnchor(text, { ...anchor, start: 0, end: 6 })).toEqual({
      start: 25,
      end: 31,
    });
    expect(anchor.quoteHash).toBeTruthy();
  });

  it('resolves anchors after whitespace normalization changes', () => {
    const source = 'alpha target quote omega.';
    const start = source.indexOf('target quote');
    const anchor = createTextAnchor(source, start, start + 'target quote'.length);
    const rendered = 'alpha target\n  quote omega.';

    expect(resolveTextAnchor(rendered, { ...anchor, start: 0, end: 4 })).toEqual({
      start: rendered.indexOf('target'),
      end: rendered.indexOf(' omega'),
    });
  });

  it('creates PDF text anchors with page-local geometry', () => {
    const anchor = createPdfTextAnchor({
      pageText: 'alpha target omega',
      pageIndex: 2,
      start: 6,
      end: 12,
      pageWidth: 600,
      pageHeight: 800,
      rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.04 }],
    });

    expect(isPdfTextAnchor(anchor)).toBe(true);
    expect(anchor).toMatchObject({
      kind: 'pdf-text',
      exact: 'target',
      pageIndex: 2,
      pageWidth: 600,
      pageHeight: 800,
    });
    expect(anchor.rects).toHaveLength(1);
  });
});

describe('agent presets', () => {
  it('enables every preset assistant by default', () => {
    expect(agentPersonalities.every((personality) => personality.defaultEnabled)).toBe(true);
  });

  it('keeps each preset assistant bound to its viewpoint guidance', () => {
    const guidanceById = new Map([
      ['reading-partner', '先替作者赢，再替真相赢。'],
      ['root-reviewer', '把作者当作天才来理解，把作者当作嫌犯来审问。'],
      ['question-mentor', '像信徒一样进入文本，像叛徒一样离开文本。'],
      ['insight-editor', '读出作者说了什么，更读出作者用什么代价说成了这件事。'],
      ['concept-translator', '用考古学家的耐心挖前提，用外科医生的冷静剖结论。'],
      ['structure-navigator', '把每本书读成一场战争：作者在攻击什么，也在保护什么。'],
      ['evidence-archivist', '把观点读成一份判决书：证据够不够，罪名准不准，量刑重不重。'],
      ['reader-advocate', '审阅观点时，既要问它看见了什么，也要问它遮住了什么。'],
      ['final-copy-editor', '替作者保留锋芒，替读者拆掉幻觉。'],
      ['logic-auditor', '把观点从金句还原成机器，检查每个齿轮是否咬合。'],
      ['risk-examiner', '审阅观点，就是检查它的野心和证据是否匹配。'],
      ['action-calibrator', '把观点放回现实里，让它承担后果。'],
    ]);

    expect(agentPersonalities).toHaveLength(guidanceById.size);
    for (const personality of agentPersonalities) {
      expect(personality.soul).toContain('## 观点指引');
      expect(personality.soul).toContain(guidanceById.get(personality.id));
    }
  });

  it('formats reading intent labels with icons', () => {
    expect(agentReadingIntentDisplayLabel('challenge')).toBe('⚔️ 挑战');
  });

  it('resolves locale-specific preset presentation without changing assistant identity', () => {
    const agent = {
      id: 'agent_reading_partner',
      kind: 'annotation' as const,
      presetId: 'reading-partner',
      enabled: true,
      providerId: 'provider_1',
      nickname: '林知微',
      username: '林知微',
      avatar: 'zh-avatar',
      annotationColor: '#8aa46a',
      annotationDensity: 'medium' as const,
      temperature: 0.4,
      soul: agentPersonalities.find((personality) => personality.id === 'reading-partner')!.soul,
      createdAt: '',
      updatedAt: '',
    };

    const publicAgent = resolveAgentPublicIdentity(agent, 'en');
    const promptIdentity = resolvePromptAgentIdentity(agent, 'en');

    expect(publicAgent.id).toBe(agent.id);
    expect(publicAgent.presetId).toBe('reading-partner');
    expect(publicAgent.nickname).toBe('June Hartley');
    expect(publicAgent.username).toBe('JuneHartley');
    expect(publicAgent.pinyin).toBeUndefined();
    expect(promptIdentity.soul).toContain('Name: June Hartley');
    expect(promptIdentity.soul).not.toBe(agent.soul);
  });

  it('keeps Chinese presentation as the default fallback', () => {
    const presentation = resolveAgentPersonalityPresentation('reading-partner');

    expect(presentation?.locale).toBe('zh-CN');
    expect(presentation?.name).toBe('林知微');
    expect(presentation?.pinyin).toBeTruthy();
  });
});

describe('provider presets', () => {
  it('keeps MiniMax out of selectable presets', () => {
    expect(providerPresets.map((preset) => preset.id)).not.toContain('minimax');
  });

  it('binds API types to provider presets', () => {
    expect(providerPresets.find((preset) => preset.id === 'openai')?.type).toBe('openai-chat');
    expect(providerPresets.find((preset) => preset.id === 'anthropic')?.type).toBe('anthropic');
    expect(providerPresets.find((preset) => preset.id === 'gemini')?.type).toBe('gemini');
    expect(
      providerPresets
        .filter((preset) => !['openai', 'anthropic', 'gemini'].includes(preset.id))
        .every((preset) => preset.type === 'openai-chat'),
    ).toBe(true);
  });
});

describe('selection action shortcuts', () => {
  it('normalizes single letter shortcuts', () => {
    expect(normalizeSelectionActionShortcutDraft({ copy: 'x', annotate: ' z ', ask: 'q' })).toEqual(
      {
        copy: 'X',
        annotate: 'Z',
        ask: 'Q',
      },
    );
    expect(normalizeSelectionActionShortcutDraft({ copy: '1', annotate: 'Enter' })).toEqual(
      defaultSelectionActionShortcuts,
    );
  });

  it('detects and resets conflicting shortcuts', () => {
    const shortcuts = normalizeSelectionActionShortcutDraft({ copy: 'b', annotate: 'B' });

    expect(selectionActionShortcutsConflict(shortcuts)).toBe(true);
    expect(normalizeSelectionActionShortcuts(shortcuts)).toEqual(defaultSelectionActionShortcuts);
  });
});
