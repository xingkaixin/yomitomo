import type { StarlightRouteData } from '@astrojs/starlight/route-data';
import { githubUrl, xUrl } from '../../site-links';

type Toc = NonNullable<StarlightRouteData['toc']>;
type TocItem = Toc['items'][number];

export type OutlineItem = { slug: string; text: string; depth: number };

const flatten = (items: TocItem[]): OutlineItem[] =>
  items.flatMap((item) => [
    { slug: item.slug, text: item.text, depth: item.depth },
    ...flatten(item.children),
  ]);

export const getOutline = (toc: StarlightRouteData['toc']) =>
  flatten(toc?.items ?? []).filter((item) => item.slug !== '_top');

export const getPageLinks = (sidebar: StarlightRouteData['sidebar']) =>
  sidebar.filter((entry) => entry.type === 'link');

export const getDocsLabels = (lang: string) => {
  if (lang === 'en') {
    return {
      pages: 'Contents',
      close: 'Close',
      help: 'Still need help?',
      pager: 'Pagination',
      prev: 'Previous',
      next: 'Next',
    };
  }
  if (lang === 'ja') {
    return {
      pages: '目次',
      close: '閉じる',
      help: 'お困りですか？',
      pager: 'ページ送り',
      prev: '前のページ',
      next: '次のページ',
    };
  }
  return {
    pages: '目录',
    close: '关闭',
    help: '还需要帮助？',
    pager: '翻页',
    prev: '上一页',
    next: '下一页',
  };
};

export const helpLinks = [
  { label: 'GitHub Issues', href: `${githubUrl}/issues` },
  { label: 'X', href: xUrl },
];
