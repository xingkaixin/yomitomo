import { Database, ExternalLink, RefreshCw } from 'lucide-react';
import type { DesktopStoreLoadErrorInfo } from '../../app-store-errors';

import { CopyIconButton } from './app-ui';

const LATEST_RELEASE_URL = 'https://github.com/xingkaixin/yomitomo/releases/latest';

export function StoreLoadErrorScreen({
  error,
  onRetry,
}: {
  error: DesktopStoreLoadErrorInfo;
  onRetry: () => Promise<unknown>;
}) {
  const databaseTooNew = error.code === 'DATABASE_TOO_NEW';

  function openLatestRelease() {
    void window.yomitomoDesktop.openUrl(LATEST_RELEASE_URL).catch(() => undefined);
  }

  return (
    <main className="store-load-error-shell" role="alert" aria-labelledby="store-load-error-title">
      <section className="store-load-error-panel">
        <div className="store-load-error-icon">
          <Database size={28} />
        </div>
        <p className="store-load-error-kicker">
          {databaseTooNew ? '数据库版本较新' : '请先保留数据文件'}
        </p>
        <h1 id="store-load-error-title">
          {databaseTooNew ? '当前版本无法打开这份数据库' : '本地数据库加载失败'}
        </h1>
        <p className="store-load-error-message">{error.message}</p>

        {error.requiredReaderLevel && error.supportedReaderLevel ? (
          <dl className="store-load-error-levels">
            <div>
              <dt>数据库需要</dt>
              <dd>Level {error.requiredReaderLevel}</dd>
            </div>
            <div>
              <dt>当前应用支持</dt>
              <dd>Level {error.supportedReaderLevel}</dd>
            </div>
          </dl>
        ) : null}

        {error.logPath ? (
          <div className="store-load-error-path">
            <span>日志文件</span>
            <code>{error.logPath}</code>
            <CopyIconButton label="复制日志路径" value={error.logPath} />
          </div>
        ) : null}

        <div className="store-load-error-actions">
          <button className="action-button" type="button" onClick={() => void onRetry()}>
            <RefreshCw size={16} />
            重试
          </button>
          <button className="action-button is-primary" type="button" onClick={openLatestRelease}>
            <ExternalLink size={16} />
            打开最新版
          </button>
        </div>
      </section>
    </main>
  );
}
