import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import type { Annotation, Downloads, LandingMeta, Paragraph, UiStrings } from './data/article';
import { useLanding } from './LandingContext';
import HighlightSpan from './HighlightSpan';
import AnnotationCard from './AnnotationCard';
import AnnotationConnection from './AnnotationConnection';

/** Two rails (left + right) only when the viewport is wide enough. */
function useDualRail() {
  const [dual, setDual] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1480px)');
    const update = () => setDual(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return dual;
}

/** Split annotations across left/right rails. Single rail keeps everything right. */
function splitAnnotations(items: Annotation[], dual: boolean) {
  if (!dual) return { left: [] as Annotation[], right: items };
  const left: Annotation[] = [];
  const right: Annotation[] = [];
  items.forEach((item, index) => (index % 2 === 0 ? right : left).push(item));
  return { left, right };
}

function ArticleContent({
  paragraphs,
  meta,
  eyebrow,
  activeAnnotationId,
  onActivate,
}: {
  paragraphs: Paragraph[];
  meta: LandingMeta;
  eyebrow: string;
  activeAnnotationId: string | null;
  onActivate: (id: string | null) => void;
}) {
  return (
    <article className="mx-auto max-w-[680px] px-6 pb-24 pt-12 md:px-0">
      <header className="mb-12">
        <p className="mb-3 font-mono text-xs font-medium tracking-widest text-[#8b8fa0] uppercase">
          {eyebrow}
        </p>
        <h1
          className="mb-4 text-[clamp(32px,5vw,48px)] font-black leading-[1.12] tracking-tight"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {meta.title}
        </h1>
        <div className="flex items-center gap-3 text-sm text-[#5b6072]">
          <span className="font-medium text-[#20242e]">{meta.byline}</span>
          <span className="text-[#d4ccc0]">·</span>
          <span>{meta.date}</span>
          <span className="text-[#d4ccc0]">·</span>
          <span>{meta.readingTime}</span>
        </div>
      </header>

      <div
        className="space-y-8 text-lg leading-[1.9] text-[#363b48]"
        style={{ fontFamily: 'var(--font-serif)' }}
        onClick={() => onActivate(null)}
      >
        {paragraphs.map((paragraph) => (
          <p key={paragraph.id}>
            {paragraph.segments.map((segment, index) =>
              segment.type === 'highlight' ? (
                <HighlightSpan
                  key={`${paragraph.id}-${index}`}
                  annotationId={segment.annotationId}
                  activeAnnotationId={activeAnnotationId}
                  onActivate={onActivate}
                >
                  {segment.content}
                </HighlightSpan>
              ) : (
                <span key={`${paragraph.id}-${index}`}>{segment.content}</span>
              ),
            )}
          </p>
        ))}
      </div>
    </article>
  );
}

/** Prominent download card: two labelled platform buttons + version badge. */
function DownloadCard({ ui, downloads }: { ui: UiStrings; downloads: Downloads }) {
  return (
    <div className="rounded-2xl border border-[#e7c98a] bg-[#fdf6e3] p-5 shadow-[0_8px_24px_rgba(180,140,30,0.12)]">
      <div className="mb-1 flex items-center justify-between gap-3">
        <p
          className="text-base font-bold text-[#20242e]"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          {ui.download.title}
        </p>
        <span className="rounded-full bg-[#20242e]/8 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wide text-[#5b6072]">
          v{downloads.version}
        </span>
      </div>
      <p className="mb-4 text-xs leading-relaxed text-[#5b6072]">{ui.download.desc}</p>

      <div className="flex flex-col gap-2.5">
        <a
          href={downloads.mac}
          className="flex items-center gap-3 rounded-xl bg-[#20242e] px-4 py-3 text-white transition-colors hover:bg-[#363b48]"
        >
          <span className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">{ui.download.mac}</span>
            <span className="text-[11px] text-white/65">{ui.download.macArch}</span>
          </span>
          <Download size={15} className="ml-auto shrink-0 text-white/70" />
        </a>
        <a
          href={downloads.windows}
          className="flex items-center gap-3 rounded-xl border border-[#dcd2bf] bg-white px-4 py-3 text-[#20242e] transition-colors hover:bg-[#faf6ec]"
        >
          <span className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">{ui.download.win}</span>
            <span className="text-[11px] text-[#8b8fa0]">{ui.download.winArch}</span>
          </span>
          <Download size={15} className="ml-auto shrink-0 text-[#b8b0a4]" />
        </a>
      </div>
    </div>
  );
}

function AnnotationRail({
  items,
  header,
  ui,
  downloads,
  onActivate,
}: {
  items: Annotation[];
  header?: string;
  ui: UiStrings;
  downloads?: Downloads;
  onActivate: (id: string | null) => void;
}) {
  return (
    <aside className="hidden lg:block">
      <div className="sticky top-20 space-y-4">
        {/* Download is the rail's primary action: keep it at the top. */}
        {downloads && <DownloadCard ui={ui} downloads={downloads} />}
        {header ? (
          <p className="px-1 font-mono text-[10px] font-medium tracking-widest text-[#8b8fa0] uppercase">
            {header}
          </p>
        ) : (
          <div className="h-[14px]" aria-hidden="true" />
        )}
        {items.map((annotation) => (
          <AnnotationCard key={annotation.id} annotation={annotation} onActivate={onActivate} />
        ))}
      </div>
    </aside>
  );
}

function MobileAnnotations({
  items,
  ui,
  downloads,
  onActivate,
}: {
  items: Annotation[];
  ui: UiStrings;
  downloads: Downloads;
  onActivate: (id: string | null) => void;
}) {
  return (
    <section className="border-t border-[#e6e1d5] bg-[#faf8f5] px-6 py-10 lg:hidden">
      <div className="mx-auto mb-8 max-w-[680px]">
        <DownloadCard ui={ui} downloads={downloads} />
      </div>
      <p className="mb-6 font-mono text-[10px] font-medium tracking-widest text-[#8b8fa0] uppercase">
        {ui.railHeader}
      </p>
      <div className="mx-auto max-w-[680px] space-y-4">
        {items.map((annotation) => (
          <AnnotationCard key={annotation.id} annotation={annotation} onActivate={onActivate} />
        ))}
      </div>
    </section>
  );
}

export default function ReaderArticle({ downloads }: { downloads: Downloads }) {
  const { paragraphs, annotations, meta, ui } = useLanding();
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const dual = useDualRail();

  const handleActivate = useCallback((id: string | null) => {
    setActiveAnnotationId(id);
  }, []);

  const { left, right } = useMemo(() => splitAnnotations(annotations, dual), [annotations, dual]);

  return (
    <>
      <AnnotationConnection annotationId={activeAnnotationId} />
      <main className={`mx-auto ${dual ? 'max-w-[1560px]' : 'max-w-[1200px]'}`}>
        <div className="flex justify-center gap-12 lg:px-6">
          {dual && (
            <div className="w-[340px] shrink-0 pt-12">
              <AnnotationRail items={left} ui={ui} onActivate={handleActivate} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <ArticleContent
              paragraphs={paragraphs}
              meta={meta}
              eyebrow={ui.eyebrow}
              activeAnnotationId={activeAnnotationId}
              onActivate={handleActivate}
            />
          </div>
          <div className="hidden w-[340px] shrink-0 pt-12 lg:block">
            <AnnotationRail
              items={right}
              header={ui.railHeader}
              ui={ui}
              downloads={downloads}
              onActivate={handleActivate}
            />
          </div>
        </div>
        <MobileAnnotations
          items={annotations}
          ui={ui}
          downloads={downloads}
          onActivate={handleActivate}
        />
      </main>
    </>
  );
}
