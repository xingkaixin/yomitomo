import starlight from '@astrojs/starlight';
import react from '@astrojs/react';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://yomitomo.app',
  output: 'static',
  integrations: [
    react(),
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
            rel: 'preload',
            as: 'font',
            type: 'font/woff2',
            href: '/assets/fonts/SourceSerif4-Bold.woff2',
            crossorigin: '',
          },
        },
        {
          tag: 'link',
          attrs: {
            rel: 'preload',
            as: 'font',
            type: 'font/woff2',
            href: '/assets/fonts/JetBrainsMono-Bold.woff2',
            crossorigin: '',
          },
        },
        {
          tag: 'link',
          attrs: {
            rel: 'preload',
            as: 'font',
            type: 'font/woff2',
            href: '/assets/fonts/NotoSerifSC-Regular.woff2',
            crossorigin: '',
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
        MobileMenuFooter: './src/components/starlight/MobileMenuFooter.astro',
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
