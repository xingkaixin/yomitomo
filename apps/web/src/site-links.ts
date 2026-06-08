import { compareVersionLabelsDesc } from './changelog-utils';

const changelogPages = import.meta.glob('./content/docs/changelogs/v*.md', { eager: true });
const englishChangelogPages = import.meta.glob('./content/docs/en/changelogs/v*.md', {
  eager: true,
});

const latestChangelog = latestChangelogPage(Object.keys(changelogPages), '/changelogs');
const latestEnglishChangelog = latestChangelogPage(
  Object.keys(englishChangelogPages),
  '/en/changelogs',
);

function latestChangelogPage(paths: string[], urlPrefix: string) {
  const page = paths
    .map((path) => {
      const slug = path.match(/\/(v\d+(?:-\d+)*)\.md$/)?.[1];
      if (!slug) throw new Error(`Invalid changelog path: ${path}`);

      return {
        label: slug.slice(1).replaceAll('-', '.'),
        url: `${urlPrefix}/${slug}/`,
      };
    })
    .toSorted((a, b) => compareVersionLabelsDesc(a.label, b.label))[0];

  if (!page) {
    throw new Error(`No changelog pages found for ${urlPrefix}.`);
  }

  return page;
}

export const githubUrl = 'https://github.com/xingkaixin/yomitomo';
export const youtubeUrl = 'https://www.youtube.com/@yomitomo';
export const xUrl = 'https://x.com/yomitomo';
export const docsUrl = '/docs/';
export const englishDocsUrl = '/en/docs/';
export const blogUrl = '/blog/';
export const englishBlogUrl = '/en/blog/';
export const wereadApiKeyDocsUrl = '/docs/weread-api-key/';
export const englishWereadApiKeyDocsUrl = '/en/docs/weread-api-key/';
export const changelogsUrl = latestChangelog.url;
export const englishChangelogsUrl = latestEnglishChangelog.url;
