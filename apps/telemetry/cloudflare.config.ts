export default {
  worker: {
    name: 'yomitomo-telemetry',
    compatibilityDate: '2026-06-22',
    entrypoint: 'src/index.ts',
    domains: ['telemetry.yomitomo.app'],
    env: {
      TELEMETRY_ANALYTICS: {
        type: 'analytics-engine-dataset',
        name: 'yomitomo_telemetry_events',
      },
    },
  },
};
