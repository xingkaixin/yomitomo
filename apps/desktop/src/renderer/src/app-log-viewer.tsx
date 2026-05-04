import React, { useEffect, useMemo, useState } from 'react';
import { Check, FileText, Info, RefreshCcw, Search, Trash2 } from 'lucide-react';
import { formatDateTime, formatLogData, parseLogEntries, type LogEntry } from './app-utils';
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
import { PanelHeader } from './app-ui';
import type { SaveState } from './app-types';

type LogLevelFilter = 'all' | 'info' | 'error';

export function AboutSettings() {
  return (
    <div className="settings-panel">
      <PanelHeader
        icon={<Info size={20} />}
        title="关于"
        description="应用信息、日志查看和本地诊断。"
      />
      <section className="detail-pane about-section">
        <LogViewer />
      </section>
    </div>
  );
}

function LogViewer() {
  const [logPath, setLogPath] = useState('');
  const [rawLog, setRawLog] = useState('');
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState<LogLevelFilter>('all');
  const [status, setStatus] = useState('');
  const [refreshState, setRefreshState] = useState<SaveState>('idle');
  const [clearState, setClearState] = useState<SaveState>('idle');

  useEffect(() => {
    loadLog();
  }, []);

  const entries = useMemo(() => parseLogEntries(rawLog), [rawLog]);
  const hasLogContent = rawLog.trim().length > 0;
  const visibleEntries = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (level !== 'all' && entry.level !== level) return false;
      if (!needle) return true;
      return entry.raw.toLowerCase().includes(needle);
    });
  }, [entries, level, query]);

  async function loadLog() {
    const desktop = window.yomitomoDesktop;
    if (!desktop || refreshState === 'saving') return;

    setRefreshState('saving');
    const [path, content] = await Promise.all([desktop.getLogPath(), desktop.readLog()]);
    setLogPath(path);
    setRawLog(content);
    setStatus(`已加载 ${formatDateTime(new Date().toISOString())}`);
    setRefreshState('saved');
    window.setTimeout(() => setRefreshState('idle'), 1000);
  }

  async function clearLog() {
    const desktop = window.yomitomoDesktop;
    if (!desktop || !hasLogContent || clearState === 'saving') return;

    setClearState('saving');
    await desktop.clearLog();
    setRawLog('');
    setStatus('日志已清理');
    setClearState('saved');
    window.setTimeout(() => setClearState('idle'), 1000);
  }

  return (
    <div className="log-viewer">
      <div className="log-header">
        <div>
          <h3>日志</h3>
          <p>打开此页时加载一次，点击刷新读取新内容。</p>
        </div>
        <div className="log-actions">
          <Button
            className={
              refreshState === 'saving'
                ? 'action-button test-action log-refresh-action is-loading'
                : 'action-button test-action log-refresh-action'
            }
            disabled={refreshState === 'saving'}
            variant="secondary"
            type="button"
            onClick={loadLog}
          >
            <RefreshCcw size={16} />
            {refreshState === 'saving' ? '刷新中' : refreshState === 'saved' ? '已刷新' : '刷新'}
          </Button>
          <Button
            className={
              clearState === 'saved'
                ? 'action-button danger-action log-clear-action is-cleared'
                : 'action-button danger-action log-clear-action'
            }
            disabled={!hasLogContent || clearState === 'saving'}
            variant="destructive"
            type="button"
            onClick={clearLog}
          >
            {clearState === 'saved' ? <Check size={16} /> : <Trash2 size={16} />}
            {clearState === 'saving' ? '清理中' : clearState === 'saved' ? '已清理' : '清理'}
          </Button>
        </div>
      </div>
      <div className="log-path-row">
        <FileText size={16} />
        <span>{logPath || '日志路径加载中...'}</span>
        {logPath ? (
          <Button
            variant="secondary"
            type="button"
            onClick={() => navigator.clipboard.writeText(logPath)}
          >
            复制路径
          </Button>
        ) : null}
      </div>
      <div className="log-toolbar">
        <div className="log-search">
          <Search size={16} />
          <Input
            placeholder="搜索日志事件、内容或路径"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Select value={level} onValueChange={(value) => setLevel(value as LogLevelFilter)}>
          <SelectTrigger className="log-level-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="theme-select-content">
            <SelectGroup>
              <SelectItem value="all">全部级别</SelectItem>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <div className="log-summary">
        <span>
          {visibleEntries.length} / {entries.length} 条
        </span>
        <span>{status}</span>
      </div>
      <div className="log-list">
        {visibleEntries.length > 0 ? (
          visibleEntries.map((entry) => <LogEntryRow entry={entry} key={entry.id} />)
        ) : (
          <div className="log-empty">没有匹配的日志</div>
        )}
      </div>
    </div>
  );
}

function LogEntryRow({ entry }: { entry: LogEntry }) {
  return (
    <article className={`log-entry is-${entry.level}`}>
      <div className="log-entry-meta">
        <span>{entry.level}</span>
        <time>{formatDateTime(entry.at)}</time>
      </div>
      <strong>{entry.event}</strong>
      {entry.data === undefined ? null : <pre>{formatLogData(entry.data)}</pre>}
    </article>
  );
}
