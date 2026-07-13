export const siteUrl = 'https://yomitomo.app';

const organizationId = `${siteUrl}/#organization`;
const websiteId = `${siteUrl}/#website`;
const softwareId = `${siteUrl}/#software`;
const ogImageUrl = `${siteUrl}/assets/og-image.jpg`;

const organization = {
  '@type': 'Organization',
  '@id': organizationId,
  name: 'Yomitomo',
  url: siteUrl,
  logo: `${siteUrl}/assets/yomitomo-logo.png`,
};

const website = {
  '@type': 'WebSite',
  '@id': websiteId,
  name: 'Yomitomo',
  url: siteUrl,
  publisher: { '@id': organizationId },
};

type LandingStructuredDataOptions = {
  canonicalUrl: string;
  description: string;
  downloads: { mac: string; windows: string };
  faqItems: { question: string; answer: string }[];
  language: 'zh-CN' | 'en';
  sameAs: string[];
  title: string;
  version: string;
};

export function buildLandingStructuredData({
  canonicalUrl,
  description,
  downloads,
  faqItems,
  language,
  sameAs,
  title,
  version,
}: LandingStructuredDataOptions) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { ...organization, sameAs },
      website,
      {
        '@type': 'WebPage',
        '@id': `${canonicalUrl}#webpage`,
        url: canonicalUrl,
        name: title,
        description,
        inLanguage: language,
        isPartOf: { '@id': websiteId },
        about: { '@id': softwareId },
        primaryImageOfPage: { '@id': `${siteUrl}/#primaryimage` },
      },
      {
        '@type': 'ImageObject',
        '@id': `${siteUrl}/#primaryimage`,
        url: ogImageUrl,
        width: 1200,
        height: 630,
      },
      {
        '@type': 'SoftwareApplication',
        '@id': softwareId,
        name: 'Yomitomo',
        applicationCategory: 'EducationalApplication',
        operatingSystem: ['macOS', 'Windows'],
        softwareVersion: version,
        url: siteUrl,
        image: { '@id': `${siteUrl}/#primaryimage` },
        screenshot: [
          `${siteUrl}/assets/read.webp`,
          `${siteUrl}/assets/epub.webp`,
          `${siteUrl}/assets/webpage.webp`,
        ],
        description,
        publisher: { '@id': organizationId },
        offers: [
          {
            '@type': 'Offer',
            url: downloads.mac,
            price: '0',
            priceCurrency: 'USD',
          },
          {
            '@type': 'Offer',
            url: downloads.windows,
            price: '0',
            priceCurrency: 'USD',
          },
        ],
      },
      {
        '@type': 'FAQPage',
        '@id': `${canonicalUrl}#faq`,
        inLanguage: language,
        mainEntity: faqItems.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: item.answer,
          },
        })),
      },
    ],
  };
}

type BlogArticleStructuredDataOptions = {
  canonicalUrl: string;
  dateModified?: Date;
  description: string;
  language: 'zh-CN' | 'en';
  title: string;
};

export function buildBlogArticleStructuredData({
  canonicalUrl,
  dateModified,
  description,
  language,
  title,
}: BlogArticleStructuredDataOptions) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      organization,
      website,
      {
        '@type': 'WebPage',
        '@id': `${canonicalUrl}#webpage`,
        url: canonicalUrl,
        name: title,
        description,
        inLanguage: language,
        isPartOf: { '@id': websiteId },
        about: { '@id': softwareId },
        mainEntity: { '@id': `${canonicalUrl}#article` },
      },
      {
        '@type': 'BlogPosting',
        '@id': `${canonicalUrl}#article`,
        headline: title,
        description,
        image: ogImageUrl,
        inLanguage: language,
        isAccessibleForFree: true,
        mainEntityOfPage: { '@type': 'WebPage', '@id': `${canonicalUrl}#webpage` },
        author: { '@id': organizationId },
        publisher: { '@id': organizationId },
        ...(dateModified ? { dateModified: dateModified.toISOString() } : {}),
      },
    ],
  };
}

export function isBlogScenarioPath(pathname: string) {
  return /^\/(?:en\/)?blog\/scenarios\/[^/]+\/$/.test(pathname);
}
