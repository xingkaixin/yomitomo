import { useEffect } from 'react';
import { readerConversationStyles } from '@yomitomo/reader-ui/reader-styles';
import ReaderToolbar from './components/ReaderToolbar';
import ReaderArticle from './components/ReaderArticle';

/**
 * Inject reader-ui CSS once on mount.
 * This provides all .reader-note, .reader-annotation-connection, .reader-comment
 * etc. class styles used by AnnotationConnection, ReadonlyAnnotationCard, and
 * the distillation ticket.
 */
function ReaderUiStyles() {
  useEffect(() => {
    const id = 'reader-ui-styles';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = readerConversationStyles;
    document.head.appendChild(style);
  }, []);
  return null;
}

export default function App() {
  return (
    <div className="relative min-h-screen bg-[#fffdf8]">
      {/* Subtle top glow */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[400px] opacity-40"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(244, 201, 93, 0.15), transparent)',
        }}
        aria-hidden="true"
      />
      <ReaderUiStyles />
      <ReaderToolbar />
      <ReaderArticle />
      <footer className="relative border-t border-[#e8e0d4] py-8 text-center">
        <p className="text-xs text-[#9e9285]">
          © 2025 Yomitomo. 开源在 MIT 协议下。
        </p>
      </footer>
    </div>
  );
}
