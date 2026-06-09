import { useCallback, useState } from 'react';
import { Download, Github } from 'lucide-react';
import { paragraphs, annotations, articleMeta } from '../data/article';
import HighlightSpan from './HighlightSpan';
import AnnotationCard from './AnnotationCard';
import AnnotationConnection from './AnnotationConnection';

function ArticleContent({
  activeAnnotationId,
  onActivate,
}: {
  activeAnnotationId: string | null;
  onActivate: (id: string | null) => void;
}) {
  return (
    <article className="mx-auto max-w-[680px] px-6 pb-24 pt-12 md:px-0">
      <header className="mb-12">
        <p className="mb-3 font-mono text-xs font-medium tracking-widest text-[#9e9285] uppercase">
          Yomitomo / 产品介绍
        </p>
        <h1
          className="mb-4 text-[clamp(32px,5vw,48px)] font-black leading-[1.15] tracking-tight"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          {articleMeta.title}
        </h1>
        <div className="flex items-center gap-3 text-sm text-[#7a6e5f]">
          <span className="font-medium text-[#2a2218]">{articleMeta.byline}</span>
          <span className="text-[#d4ccc0]">·</span>
          <span>{articleMeta.date}</span>
          <span className="text-[#d4ccc0]">·</span>
          <span>{articleMeta.readingTime}</span>
        </div>
      </header>

      <div
        className="space-y-8 text-lg leading-[1.9] text-[#3a3028]"
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

function AnnotationRail({
  onActivate,
}: {
  onActivate: (id: string | null) => void;
}) {
  return (
    <aside className="hidden lg:block">
      <div className="sticky top-20 space-y-4">
        <p className="px-1 font-mono text-[10px] font-medium tracking-widest text-[#9e9285] uppercase">
          划线与讨论
        </p>
        {annotations.map((annotation) => (
          <AnnotationCard
            key={annotation.id}
            annotation={annotation}
            
            onActivate={onActivate}
          />
        ))}

        {/* Download CTA */}
        <div className="mt-6 rounded-2xl border border-[#e8e0d4] bg-white p-5">
          <p
            className="mb-1.5 text-base font-bold text-[#2a2218]"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            下载 Yomitomo
          </p>
          <p className="mb-4 text-xs leading-relaxed text-[#7a6e5f]">
            完全免费、开源，数据全在本地。
          </p>
          <div className="flex flex-col gap-2">
            <a
              href="https://yomitomo.app"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#2a2218] px-4 py-2.5 text-xs font-medium text-white transition-colors hover:bg-[#4a3e30]"
            >
              <Download size={14} />
              下载 macOS 版
            </a>
            <a
              href="https://github.com/yomitomo/yomitomo"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-[#e8e0d4] bg-white px-4 py-2.5 text-xs font-medium text-[#2a2218] transition-colors hover:bg-[#faf8f5]"
            >
              <Github size={14} />
              GitHub
            </a>
          </div>
        </div>
      </div>
    </aside>
  );
}

function MobileAnnotations({
  onActivate,
}: {
  onActivate: (id: string | null) => void;
}) {
  return (
    <section className="border-t border-[#e8e0d4] bg-[#faf8f5] px-6 py-10 lg:hidden">
      <p className="mb-6 font-mono text-[10px] font-medium tracking-widest text-[#9e9285] uppercase">
        划线与讨论
      </p>
      <div className="mx-auto max-w-[680px] space-y-4">
        {annotations.map((annotation) => (
          <AnnotationCard
            key={annotation.id}
            annotation={annotation}
            
            onActivate={onActivate}
          />
        ))}
      </div>

      {/* Mobile Download CTA */}
      <div className="mx-auto mt-8 max-w-[680px] rounded-2xl border border-[#e8e0d4] bg-white p-6 text-center">
        <p
          className="mb-2 text-lg font-bold text-[#2a2218]"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          下载 Yomitomo
        </p>
        <p className="mb-4 text-sm text-[#7a6e5f]">
          完全免费、开源，数据全在本地。
        </p>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href="https://yomitomo.app"
            className="inline-flex items-center gap-2 rounded-full bg-[#2a2218] px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-[#4a3e30]"
          >
            <Download size={16} />
            下载 macOS 版
          </a>
          <a
            href="https://github.com/yomitomo/yomitomo"
            className="inline-flex items-center gap-2 rounded-full border border-[#e8e0d4] bg-white px-6 py-3 text-sm font-medium text-[#2a2218] transition-colors hover:bg-[#faf8f5]"
          >
            <Github size={16} />
            GitHub
          </a>
        </div>
      </div>
    </section>
  );
}

export default function ReaderArticle() {
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);

  const handleActivate = useCallback((id: string | null) => {
    setActiveAnnotationId(id);
  }, []);

  return (
    <>
      <AnnotationConnection annotationId={activeAnnotationId} />
      <main className="mx-auto max-w-[1200px]">
        <div className="flex gap-12 lg:px-6">
          <div className="min-w-0 flex-1">
            <ArticleContent
              activeAnnotationId={activeAnnotationId}
              onActivate={handleActivate}
            />
          </div>
          <div className="w-[340px] shrink-0 pt-12">
            <AnnotationRail
              onActivate={handleActivate}
            />
          </div>
        </div>
        <MobileAnnotations
          onActivate={handleActivate}
        />
      </main>
    </>
  );
}
