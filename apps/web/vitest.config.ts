import { getViteConfig } from 'astro/config';

const config: Parameters<typeof getViteConfig>[0] & {
  test: { passWithNoTests: boolean };
} = {
  test: {
    passWithNoTests: true,
  },
};

export default getViteConfig(config);
