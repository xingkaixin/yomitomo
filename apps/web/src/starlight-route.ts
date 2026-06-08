import { defineRouteMiddleware } from '@astrojs/starlight/route-data';
import type { StarlightRouteData } from '@astrojs/starlight/route-data';
import { compareVersionLabelsDesc } from './changelog-utils';

const flattenSidebarGroup = (sidebar: StarlightRouteData['sidebar'], label: string) => {
  const group = sidebar.find((item) => item.type === 'group' && item.label === label);

  return group?.type === 'group' ? group.entries : [];
};

const flattenNestedGroups = (sidebar: StarlightRouteData['sidebar']) =>
  sidebar.flatMap((item) => (item.type === 'group' ? item.entries : [item]));

export const onRequest = defineRouteMiddleware((context) => {
  const { pathname } = context.url;
  const sidebar = context.locals.starlightRoute.sidebar;
  const isEnglish = pathname.startsWith('/en/');
  const docsPrefix = isEnglish ? '/en/docs' : '/docs';
  const blogPrefix = isEnglish ? '/en/blog' : '/blog';
  const changelogsPrefix = isEnglish ? '/en/changelogs' : '/changelogs';

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
