import { defineRouteMiddleware } from '@astrojs/starlight/route-data';
import type { StarlightRouteData } from '@astrojs/starlight/route-data';
import { compareVersionLabelsDesc } from './changelog-utils';
import { buildBlogArticleStructuredData, isBlogScenarioPath, siteUrl } from './structured-data';

const flattenSidebarGroup = (sidebar: StarlightRouteData['sidebar'], label: string) => {
  const group = sidebar.find((item) => item.type === 'group' && item.label === label);

  return group?.type === 'group' ? group.entries : [];
};

const flattenNestedGroups = (sidebar: StarlightRouteData['sidebar']) =>
  sidebar.flatMap((item) => (item.type === 'group' ? item.entries : [item]));

export const onRequest = defineRouteMiddleware((context) => {
  const { pathname } = context.url;
  const route = context.locals.starlightRoute;
  const sidebar = route.sidebar;
  const isEnglish = pathname.startsWith('/en/');
  const isJapanese = pathname.startsWith('/ja/');
  const localePrefix = isEnglish ? '/en' : isJapanese ? '/ja' : '';
  const docsPrefix = `${localePrefix}/docs`;
  const blogPrefix = `${localePrefix}/blog`;
  const changelogsPrefix = `${localePrefix}/changelogs`;

  if (isBlogScenarioPath(pathname) && route.entry.data.description) {
    route.head.push({
      tag: 'script',
      attrs: { type: 'application/ld+json' },
      content: JSON.stringify(
        buildBlogArticleStructuredData({
          canonicalUrl: new URL(pathname, siteUrl).href,
          dateModified: route.lastUpdated,
          description: route.entry.data.description,
          language: isEnglish ? 'en' : isJapanese ? 'ja' : 'zh-CN',
          title: route.entry.data.title,
        }),
      ),
    });
  }

  if (pathname.startsWith(changelogsPrefix)) {
    context.locals.starlightRoute.sidebar = flattenSidebarGroup(sidebar, '版本记录').toSorted(
      (a, b) => compareVersionLabelsDesc(a.label, b.label),
    );
    return;
  }

  if (pathname.startsWith(docsPrefix)) {
    context.locals.starlightRoute.sidebar = flattenSidebarGroup(sidebar, '产品文档');
    return;
  }

  if (pathname.startsWith(blogPrefix)) {
    context.locals.starlightRoute.sidebar = flattenNestedGroups(
      flattenSidebarGroup(sidebar, '博客'),
    );
  }
});
