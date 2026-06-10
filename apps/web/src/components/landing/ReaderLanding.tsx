import { getLandingContent, type Downloads, type Locale } from './data/article';
import { LandingProvider } from './LandingContext';
import ReaderArticle from './ReaderArticle';

/**
 * Reader-style product landing article. Rendered as an Astro island: Astro
 * pre-renders this tree to static HTML at build time (SEO-friendly), then
 * hydrates it for the interactive cards / discussion modal / connection lines.
 *
 * Only `lang` is passed across the island boundary (island props must be
 * JSON-serializable, and the localized content includes functions), so the
 * locale content is resolved here on both the server and the client.
 */
export default function ReaderLanding({
  lang = 'zh-CN',
  downloads,
}: {
  lang?: Locale;
  downloads: Downloads;
}) {
  const content = getLandingContent(lang);
  return (
    <LandingProvider value={content}>
      <div className="relative bg-[#fffdf8]">
        {/* Subtle top glow */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[400px] opacity-40"
          style={{
            background:
              'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(244, 201, 93, 0.15), transparent)',
          }}
          aria-hidden="true"
        />
        <ReaderArticle downloads={downloads} />
      </div>
    </LandingProvider>
  );
}
