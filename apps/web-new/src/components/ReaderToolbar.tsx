import { useEffect, useState } from 'react';
import { ChevronLeft, BookOpen, Github, Twitter } from 'lucide-react';

const navLinks = [
  { label: '文档', href: 'https://yomitomo.app/docs' },
  { label: '博客', href: 'https://yomitomo.app/blog' },
  { label: '更新日志', href: 'https://yomitomo.app/changelogs' },
];

export default function ReaderToolbar() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const pct = docHeight > 0 ? Math.min(100, (scrollTop / docHeight) * 100) : 0;
      setProgress(pct);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header className="reader-toolbar">
      {/* 左侧：返回 + Logo */}
      <div className="reader-toolbar-left">
        <a
          href="https://yomitomo.app"
          className="reader-back"
        >
          <ChevronLeft size={18} strokeWidth={2.5} />
          <span>官网</span>
        </a>
        <div className="reader-brand">
          <BookOpen size={16} className="text-[#a43f37]" />
          <span>Yomitomo</span>
        </div>
      </div>

      {/* 中间：文章标题 */}
      <div className="reader-toolbar-article">
        <div className="reader-toolbar-article-copy">
          <div className="reader-toolbar-article-title">关于 Yomitomo</div>
          <p className="reader-toolbar-article-meta">
            <span>Yomitomo Team</span>
            <span>产品介绍</span>
          </p>
        </div>
      </div>

      {/* 右侧：导航 + 外部链接 */}
      <div className="reader-toolbar-actions">
        <nav className="reader-toolbar-nav">
          {navLinks.map((link) => (
            <a key={link.label} href={link.href} className="reader-toolbar-nav-link">
              {link.label}
            </a>
          ))}
        </nav>
        <div className="reader-toolbar-divider" />
        <div className="reader-toolbar-social">
          <a
            href="https://github.com/yomitomo/yomitomo"
            target="_blank"
            rel="noopener noreferrer"
            className="reader-icon-button"
            aria-label="GitHub"
          >
            <Github size={16} />
          </a>
          <a
            href="https://twitter.com/yomitomo"
            target="_blank"
            rel="noopener noreferrer"
            className="reader-icon-button"
            aria-label="Twitter"
          >
            <Twitter size={16} />
          </a>
        </div>
      </div>

      {/* 底部进度条 */}
      <div
        className="reader-toolbar-progress"
        role="progressbar"
        aria-label="阅读进度"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
      >
        <span style={{ width: `${progress}%` }} />
      </div>
    </header>
  );
}
