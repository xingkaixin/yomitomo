export default {
  worker: {
    name: 'yomitomo-download',
    compatibilityDate: '2026-05-21',
    entrypoint: 'src/index.ts',
    domains: ['download.yomitomo.app'],
    env: {
      DOWNLOAD_ANALYTICS: {
        type: 'analytics-engine-dataset',
        name: 'yomitomo_download_events',
      },
    },
  },
};
