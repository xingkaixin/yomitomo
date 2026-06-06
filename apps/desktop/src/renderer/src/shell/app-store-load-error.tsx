import { Database, ExternalLink, RefreshCw } from 'lucide-react';
import type { DesktopStoreLoadErrorInfo } from '../../../app-store-errors';

import { CopyIconButton } from './app-ui';
import { useTranslation } from 'react-i18next';

const LATEST_RELEASE_URL = 'https://github.com/xingkaixin/yomitomo/releases/latest';

export function StoreLoadErrorScreen({
  error,
  onRetry,
}: {
  error: DesktopStoreLoadErrorInfo;
  onRetry: () => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const databaseTooNew = error.code === 'DATABASE_TOO_NEW';
  const message = databaseTooNew
    ? t('storeLoadError.databaseTooNewMessage')
    : t('storeLoadError.loadFailedMessage');

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
          {databaseTooNew
            ? t('storeLoadError.databaseTooNewKicker')
            : t('storeLoadError.keepDataKicker')}
        </p>
        <h1 id="store-load-error-title">
          {databaseTooNew
            ? t('storeLoadError.databaseTooNewTitle')
            : t('storeLoadError.loadFailedTitle')}
        </h1>
        <p className="store-load-error-message">{message}</p>

        {error.requiredReaderLevel && error.supportedReaderLevel ? (
          <dl className="store-load-error-levels">
            <div>
              <dt>{t('storeLoadError.requiredLevel')}</dt>
              <dd>Level {error.requiredReaderLevel}</dd>
            </div>
            <div>
              <dt>{t('storeLoadError.supportedLevel')}</dt>
              <dd>Level {error.supportedReaderLevel}</dd>
            </div>
          </dl>
        ) : null}

        {error.logPath ? (
          <div className="store-load-error-path">
            <span>{t('storeLoadError.logFile')}</span>
            <code>{error.logPath}</code>
            <CopyIconButton label={t('storeLoadError.copyLogPath')} value={error.logPath} />
          </div>
        ) : null}

        <div className="store-load-error-actions">
          <button className="action-button" type="button" onClick={() => void onRetry()}>
            <RefreshCw size={16} />
            {t('storeLoadError.retry')}
          </button>
          <button className="action-button is-primary" type="button" onClick={openLatestRelease}>
            <ExternalLink size={16} />
            {t('storeLoadError.openLatest')}
          </button>
        </div>
      </section>
    </main>
  );
}
