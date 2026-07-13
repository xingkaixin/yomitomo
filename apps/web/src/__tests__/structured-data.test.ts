import { describe, expect, it } from 'vitest';
import {
  buildBlogArticleStructuredData,
  buildLandingStructuredData,
  isBlogScenarioPath,
} from '../structured-data';

describe('structured data', () => {
  it('connects the landing page to a supported software application entity', () => {
    const data = buildLandingStructuredData({
      canonicalUrl: 'https://yomitomo.app/',
      description: '本地优先的 AI 伴读桌面应用',
      downloads: { mac: 'https://example.com/mac.dmg', windows: 'https://example.com/win.exe' },
      faqItems: [{ question: 'Yomitomo 是什么？', answer: '一款 AI 伴读桌面应用。' }],
      language: 'zh-CN',
      sameAs: ['https://github.com/xingkaixin/yomitomo'],
      title: 'Yomitomo - AI 伴读',
      version: '0.11.0',
    });

    expect(data['@graph']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          '@type': 'WebPage',
          about: { '@id': 'https://yomitomo.app/#software' },
          inLanguage: 'zh-CN',
        }),
        expect.objectContaining({
          '@type': 'SoftwareApplication',
          applicationCategory: 'EducationalApplication',
          operatingSystem: ['macOS', 'Windows'],
        }),
        expect.objectContaining({
          '@type': 'FAQPage',
          mainEntity: [expect.objectContaining({ name: 'Yomitomo 是什么？', '@type': 'Question' })],
        }),
      ]),
    );
  });

  it('describes localized scenario pages as organization-authored articles', () => {
    const dateModified = new Date('2026-06-09T00:31:43+08:00');
    const data = buildBlogArticleStructuredData({
      canonicalUrl: 'https://yomitomo.app/blog/scenarios/ai-reading-companion/',
      dateModified,
      description: '让大模型陪你读书，而不是替你读书。',
      language: 'zh-CN',
      title: 'AI 伴读的正确姿势',
    });

    expect(data['@graph']).toContainEqual(
      expect.objectContaining({
        '@type': 'BlogPosting',
        headline: 'AI 伴读的正确姿势',
        inLanguage: 'zh-CN',
        dateModified: dateModified.toISOString(),
        author: { '@id': 'https://yomitomo.app/#organization' },
        publisher: { '@id': 'https://yomitomo.app/#organization' },
      }),
    );
    expect(data['@graph']).toContainEqual(
      expect.objectContaining({
        '@type': 'WebPage',
        mainEntity: {
          '@id': 'https://yomitomo.app/blog/scenarios/ai-reading-companion/#article',
        },
      }),
    );
  });

  it('limits article schema to scenario detail routes', () => {
    expect(isBlogScenarioPath('/blog/scenarios/pdf-annotation/')).toBe(true);
    expect(isBlogScenarioPath('/en/blog/scenarios/pdf-annotation/')).toBe(true);
    expect(isBlogScenarioPath('/blog/')).toBe(false);
    expect(isBlogScenarioPath('/docs/reader/')).toBe(false);
  });
});
