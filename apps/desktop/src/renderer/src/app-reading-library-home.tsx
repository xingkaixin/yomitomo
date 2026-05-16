import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, RefreshCcw, Search } from 'lucide-react';
import type { ArticleRecord } from '@yomitomo/shared';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './components/ui/select';
import type { EbookImportProgressCallback } from './app-reading-types';
import {
  LIBRARY_FILTER_OPTIONS,
  LIBRARY_SORT_OPTIONS,
  articleMatchesLibraryFilter,
  articleMatchesLibrarySearch,
  compareLibraryArticles,
  groupLibraryArticles,
  type LibraryFilter,
  type LibrarySort,
} from './app-reading-library-utils';
import { ArticleLibraryCard } from './app-reading-library-card';
import { LibraryImportControls, type ArticleImportResult } from './app-reading-library-imports';

const LIBRARY_PAGE_SIZE_OPTIONS = [8, 12, 16, 24] as const;

export function LibraryHome({
  articles,
  sortedArticles,
  stats,
  onDeleteArticle,
  onImportEbookFile,
  onImportArticleUrl,
  onOpenArticle,
  onRefresh,
}: {
  articles: ArticleRecord[];
  sortedArticles: ArticleRecord[];
  stats: { annotations: number; comments: number };
  onDeleteArticle: (articleId: string) => Promise<void>;
  onImportEbookFile: (
    file: File,
    onProgress?: EbookImportProgressCallback,
  ) => Promise<ArticleImportResult>;
  onImportArticleUrl: (url: string) => Promise<ArticleImportResult>;
  onOpenArticle: (article: ArticleRecord) => void;
  onRefresh: () => void;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<LibraryFilter>('all');
  const [activeSort, setActiveSort] = useState<LibrarySort>('recentReading');
  const filteredArticles = useMemo(
    () =>
      sortedArticles
        .filter(
          (article) =>
            articleMatchesLibrarySearch(article, searchQuery) &&
            articleMatchesLibraryFilter(article, activeFilter),
        )
        .toSorted((left, right) => compareLibraryArticles(left, right, activeSort)),
    [activeFilter, activeSort, searchQuery, sortedArticles],
  );
  const pageCount = Math.max(1, Math.ceil(filteredArticles.length / pageSize));
  const pageArticles = filteredArticles.slice((page - 1) * pageSize, page * pageSize);
  const groupedPageArticles = useMemo(
    () => groupLibraryArticles(pageArticles, activeSort),
    [activeSort, pageArticles],
  );
  const pageNumbers = useMemo(() => {
    const visibleCount = Math.min(5, pageCount);
    const start = Math.min(
      Math.max(1, page - Math.floor(visibleCount / 2)),
      pageCount - visibleCount + 1,
    );
    return Array.from({ length: visibleCount }, (_, index) => start + index);
  }, [page, pageCount]);

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);

  useEffect(() => {
    setPage(1);
  }, [activeFilter, activeSort, pageSize, searchQuery]);

  return (
    <section className="library-home">
      <header className="library-home-header">
        <div className="library-home-header-main">
          <div className="library-home-heading">
            <h2>阅读库</h2>
            <p>
              {articles.length} 项内容 · {stats.annotations} 条批注 · {stats.comments} 条讨论
            </p>
          </div>
          <div className="library-home-actions">
            <label className="library-search">
              <Search size={16} />
              <Input
                type="search"
                value={searchQuery}
                placeholder="搜索文章 / 作者 / 来源"
                aria-label="搜索文章、作者或来源"
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </label>
            <LibraryImportControls
              onImportEbookFile={onImportEbookFile}
              onImportArticleUrl={onImportArticleUrl}
              onOpenArticle={onOpenArticle}
            />

            <Button type="button" variant="secondary" onClick={onRefresh}>
              <RefreshCcw size={16} />
              刷新
            </Button>
          </div>
        </div>
      </header>
      <div className="library-toolbar" aria-label="阅读库工具栏">
        <div className="library-filter-group" aria-label="阅读状态筛选">
          {LIBRARY_FILTER_OPTIONS.map((option) => (
            <button
              className={activeFilter === option.value ? 'is-active' : undefined}
              type="button"
              aria-pressed={activeFilter === option.value}
              key={option.value}
              onClick={() => setActiveFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <Select value={activeSort} onValueChange={(value) => setActiveSort(value as LibrarySort)}>
          <SelectTrigger className="library-sort-trigger" aria-label="阅读库排序">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="theme-select-content">
            <SelectGroup>
              {LIBRARY_SORT_OPTIONS.map((option) => (
                <SelectItem value={option.value} key={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <div className="library-home-body">
        {filteredArticles.length > 0 ? (
          <div className="library-card-scroll">
            {groupedPageArticles.map((group) => (
              <section className="library-card-group" key={group.label}>
                <h3 className="library-card-group-title">
                  {group.label} · {group.articles.length} 篇
                </h3>
                <div className="library-card-grid">
                  {group.articles.map((article) => (
                    <ArticleLibraryCard
                      article={article}
                      key={article.id}
                      onDelete={() => void onDeleteArticle(article.id)}
                      onOpen={() => onOpenArticle(article)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : articles.length > 0 ? (
          <section className="library-empty">
            <Search size={32} />
            <h3>暂无匹配文章</h3>
            <p>调整搜索词、阅读状态或排序后继续浏览。</p>
          </section>
        ) : (
          <section className="library-empty">
            <BookOpen size={32} />
            <h3>还没有同步文章</h3>
            <p>点击加号添加网页或 ePub 电子书，也可以通过浏览器阅读器同步文章。</p>
          </section>
        )}
      </div>
      {sortedArticles.length > 0 ? (
        <footer
          className={pageCount > 1 ? 'library-home-footer' : 'library-home-footer is-compact'}
        >
          <span>共 {filteredArticles.length} 项</span>
          {pageCount > 1 ? (
            <div className="library-pagination" aria-label="阅读库分页">
              <button
                type="button"
                aria-label="上一页"
                disabled={page === 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <ChevronLeft size={16} />
              </button>
              {pageNumbers.map((pageNumber) => (
                <button
                  className={pageNumber === page ? 'is-active' : undefined}
                  type="button"
                  aria-current={pageNumber === page ? 'page' : undefined}
                  key={pageNumber}
                  onClick={() => setPage(pageNumber)}
                >
                  {pageNumber}
                </button>
              ))}
              <button
                type="button"
                aria-label="下一页"
                disabled={page === pageCount}
                onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          ) : null}
          <Select
            value={String(pageSize)}
            onValueChange={(value) => {
              setPageSize(Number(value));
              setPage(1);
            }}
          >
            <SelectTrigger className="library-page-size-trigger" aria-label="每页显示数量">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="theme-select-content">
              <SelectGroup>
                {LIBRARY_PAGE_SIZE_OPTIONS.map((option) => (
                  <SelectItem value={String(option)} key={option}>
                    每页 {option} 项
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </footer>
      ) : null}
    </section>
  );
}
