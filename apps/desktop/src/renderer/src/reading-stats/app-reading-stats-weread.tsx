import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react';
import type {
  WeReadReadingStatsMode,
  WeReadReadingStatsSnapshot,
  WeReadReadingStatsState,
} from '@yomitomo/shared';
import { Button } from '../components/ui/button';
import { SegmentedControl } from '../components/ui/segmented-control';

const MODE_OPTIONS: Array<{ mode: WeReadReadingStatsMode; label: string }> = [
  { mode: 'weekly', label: '周' },
  { mode: 'monthly', label: '月' },
  { mode: 'annually', label: '年' },
  { mode: 'overall', label: '累计' },
];

export function WeReadReadingStatsPanel() {
  const [mode, setMode] = useState<WeReadReadingStatsMode>('monthly');
  const [periodStart, setPeriodStart] = useState(() => getPeriodStart('monthly'));
  const [state, setState] = useState<WeReadReadingStatsState>({ snapshots: [] });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const activePeriodStart = mode === 'overall' ? 0 : periodStart;
  const snapshot = useMemo(
    () =>
      state.snapshots.find((item) => item.mode === mode && item.periodStart === activePeriodStart),
    [activePeriodStart, mode, state.snapshots],
  );
  const latestSnapshot = state.snapshots[0];

  useEffect(() => {
    let canceled = false;
    void window.yomitomoDesktop
      .getWeReadReadingStats()
      .then((nextState) => {
        if (!canceled) setState(nextState);
      })
      .catch((error: unknown) => {
        if (!canceled) setMessage(errorMessage(error, '读取微信读书统计缓存失败'));
      });
    return () => {
      canceled = true;
    };
  }, []);

  function changeMode(nextMode: WeReadReadingStatsMode) {
    setMode(nextMode);
    setMessage('');
    if (nextMode !== 'overall') setPeriodStart(getPeriodStart(nextMode));
  }

  async function queryStats() {
    setLoading(true);
    setMessage('');
    try {
      const nextState = await window.yomitomoDesktop.queryWeReadReadingStats({
        mode,
        ...(mode === 'overall' ? {} : { baseTime: activePeriodStart * 1000 }),
      });
      setState(nextState);
    } catch (error) {
      setMessage(errorMessage(error, '查询微信读书统计失败'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="weread-stats-panel">
      <div className="weread-stats-toolbar">
        <SegmentedControl
          aria-label="微信读书统计周期"
          className="stats-chart-switch"
          role="tablist"
          value={mode}
          options={MODE_OPTIONS.map((option) => ({
            value: option.mode,
            label: option.label,
          }))}
          onValueChange={changeMode}
        />
        <div className="weread-stats-period">
          {mode === 'overall' ? null : (
            <button
              type="button"
              aria-label="上一个周期"
              onClick={() => setPeriodStart(shiftPeriod(mode, activePeriodStart, -1))}
            >
              <ChevronLeft size={15} />
            </button>
          )}
          <span>{periodLabel(mode, activePeriodStart)}</span>
          {mode === 'overall' ? null : (
            <button
              type="button"
              aria-label="下一个周期"
              disabled={activePeriodStart >= getPeriodStart(mode)}
              onClick={() => setPeriodStart(shiftPeriod(mode, activePeriodStart, 1))}
            >
              <ChevronRight size={15} />
            </button>
          )}
        </div>
        <Button type="button" variant="secondary" disabled={loading} onClick={queryStats}>
          {loading ? <RefreshCw size={16} className="is-spinning" /> : <Search size={16} />}
          {snapshot ? '重新查询' : queryButtonLabel(mode)}
        </Button>
      </div>
      {message ? <p className="weread-stats-message is-error">{message}</p> : null}
      {snapshot ? (
        <WeReadStatsSnapshotView snapshot={snapshot} />
      ) : (
        <div className="weread-stats-empty">
          <h3>尚未查询{periodNoun(mode)}</h3>
          <p>切换周期只会查看已保存的数据。需要更新时，点击“{queryButtonLabel(mode)}”。</p>
          {latestSnapshot ? (
            <span>
              最近一次查询：{periodLabel(latestSnapshot.mode, latestSnapshot.periodStart)}，
              {formatDateTime(latestSnapshot.fetchedAt)}
            </span>
          ) : null}
        </div>
      )}
    </section>
  );
}

function WeReadStatsSnapshotView({ snapshot }: { snapshot: WeReadReadingStatsSnapshot }) {
  const data = snapshot.data;
  const readTimes = Object.entries(data.readTimes)
    .map(([key, value]) => ({ key, label: readTimeBucketLabel(snapshot.mode, key), value }))
    .filter((item) => item.value > 0)
    .toSorted((left, right) => Number(left.key) - Number(right.key));
  const maxReadTime = Math.max(...readTimes.map((item) => item.value), 1);

  return (
    <>
      <div className="weread-stats-summary">
        <section className="stats-status-card">
          <span>{periodLabel(snapshot.mode, snapshot.periodStart)}</span>
          <strong>{formatDuration(data.totalReadTime)}</strong>
        </section>
        <section className="stats-status-card">
          <span>阅读天数</span>
          <strong>{data.readDays ?? 0} 天</strong>
        </section>
        <section className="stats-status-card">
          <span>日均阅读</span>
          <strong>{formatDuration(data.dayAverageReadTime || 0)}</strong>
        </section>
      </div>
      <div className="weread-stats-meta">
        <span>查询于 {formatDateTime(snapshot.fetchedAt)}</span>
        {data.preferTimeWord ? <span>{data.preferTimeWord}</span> : null}
        {data.preferCategoryWord ? <span>{data.preferCategoryWord}</span> : null}
      </div>
      <section className="weread-stats-grid">
        <div className="stats-insights weread-stats-card">
          <div className="stats-section-heading">
            <h3>概览</h3>
            <p>微信读书返回的周期统计</p>
          </div>
          <div className="weread-stats-kpis">
            {data.readStat.map((item) => (
              <span key={`${item.stat}:${item.counts}`}>
                <strong>{item.counts}</strong>
                {item.stat}
              </span>
            ))}
            {data.authorCount !== undefined ? (
              <span>
                <strong>{data.authorCount}</strong>
                位作者
              </span>
            ) : null}
          </div>
        </div>
        <div className="stats-insights weread-stats-card">
          <div className="stats-section-heading">
            <h3>阅读分布</h3>
            <p>{readTimeBucketDescription(snapshot.mode)}</p>
          </div>
          <div className="weread-stats-bars">
            {readTimes.length > 0 ? (
              readTimes.map((item) => (
                <div key={item.key}>
                  <span>{item.label}</span>
                  <i style={{ width: `${Math.max(6, (item.value / maxReadTime) * 100)}%` }} />
                  <strong>{formatDuration(item.value)}</strong>
                </div>
              ))
            ) : (
              <p>这个周期暂无分时数据。</p>
            )}
          </div>
        </div>
      </section>
      {data.readLongest.length > 0 ? (
        <section className="stats-insights weread-stats-card">
          <div className="stats-section-heading">
            <h3>阅读较多的书</h3>
            <p>来自微信读书统计结果</p>
          </div>
          <div className="weread-stats-book-list">
            {data.readLongest.slice(0, 6).map((book, index) => (
              <article key={`${book.bookId || book.title || index}`}>
                {book.cover ? <img alt="" src={book.cover} loading="lazy" /> : <span />}
                <div>
                  <strong>{book.title || '未命名书籍'}</strong>
                  <p>
                    {[book.author, formatDuration(book.readTime || 0)].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

function readTimeBucketLabel(mode: WeReadReadingStatsMode, key: string) {
  const timestamp = Number(key);
  if (!Number.isFinite(timestamp)) return key;
  const date = new Date(timestamp * 1000);
  if (mode === 'overall') return `${date.getFullYear()}年`;
  if (mode === 'annually') return `${date.getMonth() + 1}月`;
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function readTimeBucketDescription(mode: WeReadReadingStatsMode) {
  if (mode === 'overall') return '按年份汇总阅读时长';
  if (mode === 'annually') return '按月份汇总阅读时长';
  return '按日期汇总阅读时长';
}

function getPeriodStart(mode: WeReadReadingStatsMode, value = Date.now()) {
  if (mode === 'overall') return 0;
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  if (mode === 'weekly') {
    const day = date.getDay() || 7;
    date.setDate(date.getDate() - day + 1);
  } else if (mode === 'monthly') {
    date.setDate(1);
  } else {
    date.setMonth(0, 1);
  }
  return Math.floor(date.getTime() / 1000);
}

function shiftPeriod(mode: WeReadReadingStatsMode, periodStart: number, amount: number) {
  const date = new Date(periodStart * 1000);
  if (mode === 'weekly') date.setDate(date.getDate() + amount * 7);
  else if (mode === 'monthly') date.setMonth(date.getMonth() + amount);
  else if (mode === 'annually') date.setFullYear(date.getFullYear() + amount);
  return getPeriodStart(mode, date.getTime());
}

function periodLabel(mode: WeReadReadingStatsMode, periodStart: number) {
  if (mode === 'overall') return '累计';
  const date = new Date(periodStart * 1000);
  if (mode === 'weekly') {
    const end = new Date(date);
    end.setDate(date.getDate() + 6);
    return `${date.getFullYear()} 年 ${date.getMonth() + 1}/${date.getDate()} - ${end.getMonth() + 1}/${end.getDate()}`;
  }
  if (mode === 'monthly') return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月`;
  return `${date.getFullYear()} 年`;
}

function queryButtonLabel(mode: WeReadReadingStatsMode) {
  if (mode === 'weekly') return '查询这一周';
  if (mode === 'monthly') return '查询这一月';
  if (mode === 'annually') return '查询这一年';
  return '查询累计';
}

function periodNoun(mode: WeReadReadingStatsMode) {
  if (mode === 'weekly') return '这一周';
  if (mode === 'monthly') return '这一月';
  if (mode === 'annually') return '这一年';
  return '累计统计';
}

function formatDuration(value: number) {
  const minutes = Math.round(value / 60);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
