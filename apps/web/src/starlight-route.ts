import { defineRouteMiddleware } from '@astrojs/starlight/route-data';
import type { StarlightRouteData } from '@astrojs/starlight/route-data';
import { compareVersionLabelsDesc } from './changelog-utils';

const flattenSidebarGroup = (sidebar: StarlightRouteData['sidebar'], label: string) => {
  const group = sidebar.find((item) => item.type === 'group' && item.label === label);

  return group?.type === 'group' ? group.entries : [];
};

export const onRequest = defineRouteMiddleware((context) => {
  const { pathname } = context.url;
  const sidebar = context.locals.starlightRoute.sidebar;

  if (pathname.startsWith('/changelogs')) {
    context.locals.starlightRoute.sidebar = flattenSidebarGroup(sidebar, '版本记录').toSorted(
      (a, b) => compareVersionLabelsDesc(a.label, b.label),
    );
    return;
  }

  if (pathname.startsWith('/docs')) {
    context.locals.starlightRoute.sidebar = flattenSidebarGroup(sidebar, '产品文档');
  }
});
