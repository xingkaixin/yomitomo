import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://yomitomo.app',
  output: 'static',
  integrations: [
    starlight({
      title: 'Yomitomo 文档',
      description: 'Yomitomo 的产品使用文档和版本更新记录。',
      locales: {
        root: {
          label: '简体中文',
          lang: 'zh-CN',
        },
        en: {
          label: 'English',
          lang: 'en',
        },
      },
      favicon: '/assets/favicon.png',
      customCss: ['./src/styles/starlight.css'],
      head: [
        {
          tag: 'link',
          attrs: {
            rel: 'preconnect',
            href: 'https://fonts.googleapis.com',
          },
        },
        {
          tag: 'link',
          attrs: {
            rel: 'preconnect',
            href: 'https://fonts.gstatic.com',
            crossorigin: '',
          },
        },
        {
          tag: 'link',
          attrs: {
            rel: 'stylesheet',
            href: 'https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@700;900&display=swap',
          },
        },
      ],
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/xingkaixin/yomitomo',
        },
      ],
      sidebar: [
        {
          label: '产品文档',
          items: [{ autogenerate: { directory: 'docs' } }],
        },
        {
          label: '博客',
          items: [{ autogenerate: { directory: 'blog' } }],
        },
        {
          label: '版本记录',
          items: [{ autogenerate: { directory: 'changelogs' } }],
        },
      ],
      components: {
        Header: './src/components/starlight/Header.astro',
        Footer: './src/components/starlight/Footer.astro',
        ThemeProvider: './src/components/starlight/ThemeProvider.astro',
        ThemeSelect: './src/components/starlight/ThemeSelect.astro',
      },
      routeMiddleware: './src/starlight-route.ts',
      tableOfContents: false,
      pagefind: false,
      lastUpdated: true,
    }),
  ],
});
