import { compareVersionLabelsDesc } from './changelog-utils';

const changelogPages = import.meta.glob('./content/docs/changelogs/v*.md', { eager: true });

const latestChangelog = Object.keys(changelogPages)
  .map((path) => {
    const slug = path.match(/\/(v\d+(?:-\d+)*)\.md$/)?.[1];
    if (!slug) throw new Error(`Invalid changelog path: ${path}`);

    return {
      label: slug.slice(1).replaceAll('-', '.'),
      url: `/changelogs/${slug}/`,
    };
  })
  .toSorted((a, b) => compareVersionLabelsDesc(a.label, b.label))[0];

if (!latestChangelog) {
  throw new Error('No changelog pages found.');
}

export const githubUrl = 'https://github.com/xingkaixin/yomitomo';
export const youtubeUrl = 'https://www.youtube.com/@yomitomo';
export const xUrl = 'https://x.com/yomitomo';
export const docsUrl = '/docs/';
export const changelogsUrl = latestChangelog.url;
