import React from 'react';
import { Check, KeyRound, Unplug, X } from 'lucide-react';
import { CopyIconButton } from './app-ui';
import { Button } from './components/ui/button';
import type { PairingConnectionStatus, PairingInfo } from '../../preload';

type ExtensionConnectionState = 'unpaired' | 'idle' | 'connected';

export type ExtensionConnectionView = {
  state: ExtensionConnectionState;
  title: string;
  description: string;
  sidebarDetail: string;
};

export function getExtensionConnectionView(
  pairingInfo: PairingInfo | null,
  pairingConnectionStatus: PairingConnectionStatus,
): ExtensionConnectionView {
  if (!pairingInfo) {
    return {
      state: 'unpaired',
      title: '未配对',
      description: '生成配对码后，在浏览器扩展端输入即可连接。',
      sidebarDetail: '点击生成配对码',
    };
  }

  const readerSessionCount = pairingConnectionStatus.authenticatedSocketCount;
  if (readerSessionCount > 0) {
    return {
      state: 'connected',
      title: '已联通',
      description: `${readerSessionCount} 个阅读器会话正在连接本机`,
      sidebarDetail: pairingInfo.pairingId,
    };
  }

  return {
    state: 'idle',
    title: '扩展未工作',
    description: '打开浏览器阅读器后会自动连接本机。',
    sidebarDetail: pairingInfo.pairingId,
  };
}

export function ExtensionConnectionButton({
  pairingInfo,
  pairingConnectionStatus,
  onClick,
}: {
  pairingInfo: PairingInfo | null;
  pairingConnectionStatus: PairingConnectionStatus;
  onClick: () => void;
}) {
  const view = getExtensionConnectionView(pairingInfo, pairingConnectionStatus);

  return (
    <button
      aria-label={`扩展状态：${view.title}`}
      className={`sidebar-sync is-${view.state}`}
      type="button"
      onClick={onClick}
    >
      <span className="sidebar-sync-dot" aria-hidden="true" />
      <div>
        <strong>{view.title}</strong>
        <p className={pairingInfo ? 'sidebar-sync-code' : undefined}>{view.sidebarDetail}</p>
      </div>
    </button>
  );
}

export function ExtensionConnectionDialog({
  pairingInfo,
  pairingConnectionStatus,
  onClose,
  onRotatePairing,
}: {
  pairingInfo: PairingInfo | null;
  pairingConnectionStatus: PairingConnectionStatus;
  onClose: () => void;
  onRotatePairing: () => void | Promise<void>;
}) {
  const view = getExtensionConnectionView(pairingInfo, pairingConnectionStatus);

  React.useEffect(() => {
    function closeWithEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    window.addEventListener('keydown', closeWithEscape);
    return () => window.removeEventListener('keydown', closeWithEscape);
  }, [onClose]);

  return (
    <div
      className="extension-connection-dialog-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="extension-connection-dialog-title"
        aria-modal="true"
        className="extension-connection-dialog"
        role="dialog"
      >
        <header>
          <div className="extension-connection-dialog-heading">
            <span>
              <KeyRound size={18} />
            </span>
            <div>
              <h2 id="extension-connection-dialog-title">扩展连接</h2>
              <p>桌面端和浏览器阅读器通过本机配对码连接。</p>
            </div>
          </div>
          <button
            aria-label="关闭扩展连接"
            className="user-profile-dialog-close"
            type="button"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>

        <div className={`pairing-connected-card extension-connection-card is-${view.state}`}>
          <div className="pairing-connected-main">
            <span className="pairing-connected-icon">
              {view.state === 'connected' ? (
                <Check size={17} />
              ) : view.state === 'idle' ? (
                <Unplug size={17} />
              ) : (
                <KeyRound size={17} />
              )}
            </span>
            <div>
              <strong>{view.title}</strong>
              <p>{view.description}</p>
            </div>
          </div>
          <div className="pairing-identity">
            <span>连接标识</span>
            <strong>{pairingInfo?.pairingId || '等待生成'}</strong>
          </div>
          <div className="pairing-actions">
            {pairingInfo ? <CopyIconButton label="复制配对码" value={pairingInfo.token} /> : null}
            <Button type="button" variant="secondary" onClick={onRotatePairing}>
              <KeyRound size={16} />
              {pairingInfo ? '重新配对' : '生成配对码'}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
