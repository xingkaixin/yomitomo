import { app, BrowserWindow, session, type WebContents } from 'electron';
import { isWeReadReaderUrl } from '../weread/weread-protocol';

// 不能以 yomitomo-import 开头：缓存清理会删除那个前缀下的 partition，登录态会随之丢失。
const WEREAD_READER_PARTITION = 'persist:weread-reader';
const WEREAD_READER_ORIGIN = 'https://weread.qq.com/';
// 提示浮层在独立的 isolated world 里运行，网页版的脚本拿不到它的变量和事件处理函数。
const NOTICE_WORLD_ID = 1037;
const NOTICE_ELEMENT_ID = 'yomitomo-reader-notice';

type OpenExternalUrl = (url: string) => Promise<void>;

type ReaderNotice = {
  text: string;
  actionLabel: string;
};

let readerWindow: BrowserWindow | null = null;

export async function openWeReadReaderWindow(url: string, openExternalUrl: OpenExternalUrl) {
  const window = readerWindow ?? createReaderWindow(openExternalUrl);
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
  const loaded = await loadReaderUrl(window.webContents, url);
  if (!loaded || (await hasWeReadWebLogin())) return;
  await showReaderNotice(window.webContents, {
    text: readerLabels().loginHint,
    actionLabel: readerLabels().dismiss,
  });
}

export function closeWeReadReaderWindow() {
  readerWindow?.close();
}

export async function hasWeReadWebLogin() {
  const cookies = await readerSession().cookies.get({ url: WEREAD_READER_ORIGIN, name: 'wr_vid' });
  return cookies.length > 0;
}

export async function clearWeReadWebLogin() {
  readerWindow?.destroy();
  const readerStorage = readerSession();
  await Promise.all([readerStorage.clearStorageData(), readerStorage.clearCache()]);
}

function readerSession() {
  return session.fromPartition(WEREAD_READER_PARTITION);
}

function createReaderWindow(openExternalUrl: OpenExternalUrl) {
  const window = new BrowserWindow({
    width: 1120,
    height: 820,
    minWidth: 720,
    minHeight: 560,
    title: readerLabels().title,
    webPreferences: {
      partition: WEREAD_READER_PARTITION,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  readerWindow = window;
  window.on('closed', () => {
    if (readerWindow === window) readerWindow = null;
  });
  guardReaderContents(window.webContents, openExternalUrl);
  return window;
}

function guardReaderContents(contents: WebContents, openExternalUrl: OpenExternalUrl) {
  const openOutside = (url: string) => {
    if (!/^https?:/i.test(url)) return;
    void openExternalUrl(url).catch(() => undefined);
  };
  contents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  );
  contents.session.setPermissionCheckHandler(() => false);
  contents.setWindowOpenHandler(({ url }) => {
    openOutside(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event) => {
    if (isWeReadReaderUrl(event.url)) return;
    event.preventDefault();
    openOutside(event.url);
  });
  contents.on('will-redirect', (event) => {
    if (!event.isMainFrame || isWeReadReaderUrl(event.url)) return;
    event.preventDefault();
  });
}

async function loadReaderUrl(contents: WebContents, url: string) {
  try {
    await contents.loadURL(url);
    return true;
  } catch (error) {
    // 用户在页面加载完之前又点了一次打开，上一次加载会以 ERR_ABORTED 结束，这不是失败。
    if (error instanceof Error && 'code' in error && error.code === 'ERR_ABORTED') return false;
    throw error;
  }
}

async function showReaderNotice(contents: WebContents, notice: ReaderNotice | null) {
  if (contents.isDestroyed()) return;
  await contents
    .executeJavaScriptInIsolatedWorld(NOTICE_WORLD_ID, [{ code: readerNoticeScript(notice) }])
    .catch(() => undefined);
}

function readerNoticeScript(notice: ReaderNotice | null) {
  return `(() => {
  const id = ${JSON.stringify(NOTICE_ELEMENT_ID)};
  document.getElementById(id)?.remove();
  const notice = ${JSON.stringify(notice)};
  if (!notice) return;
  const host = document.createElement('div');
  host.id = id;
  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = ${JSON.stringify(READER_NOTICE_CSS)};
  const box = document.createElement('div');
  box.className = 'notice';
  box.setAttribute('role', 'status');
  const text = document.createElement('span');
  text.className = 'text';
  text.textContent = notice.text;
  const action = document.createElement('button');
  action.type = 'button';
  action.textContent = notice.actionLabel;
  action.addEventListener('click', () => host.remove());
  box.append(text, action);
  root.append(style, box);
  document.documentElement.append(host);
})();`;
}

// 浮层画在第三方页面里，读不到应用的主题变量；颜色取自 Yomitomo 设计系统 tokens 的亮色和暗色值。
const READER_NOTICE_CSS = `
:host { all: initial; }
.notice {
  position: fixed; top: 16px; left: 50%; z-index: 2147483647; transform: translateX(-50%);
  display: flex; align-items: center; gap: 10px; max-width: min(560px, calc(100vw - 32px));
  box-sizing: border-box; padding: 6px 6px 6px 14px;
  border: 1px solid rgba(28, 26, 23, 0.13); border-radius: 9999px;
  background: linear-gradient(180deg, #ffffff, #fbfaf7); color: #1c1a17;
  box-shadow: inset 0 1px 0 #ffffff, 0 2px 6px rgba(28, 26, 23, 0.08), 0 12px 28px -8px rgba(28, 26, 23, 0.2);
  font: 13px/20px 'PingFang SC', 'Microsoft YaHei UI', 'Noto Sans SC', system-ui, sans-serif;
}
.text { min-width: 0; }
button {
  flex-shrink: 0; height: 26px; padding: 0 10px; border: 0; border-radius: 9999px;
  background: transparent; color: #68635b; font-family: inherit; font-size: 12px; line-height: 16px;
  font-weight: 500; cursor: pointer;
}
button:hover { background: #efede8; color: #1c1a17; }
button:focus-visible { outline: 2px solid #b23223; outline-offset: 2px; }
@media (prefers-color-scheme: dark) {
  .notice {
    border-color: rgba(0, 0, 0, 0.55); background: linear-gradient(180deg, #272522, #211f1c); color: #ece8e1;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 2px 6px rgba(0, 0, 0, 0.4), 0 14px 32px -8px rgba(0, 0, 0, 0.65);
  }
  button { color: #a29c92; }
  button:hover { background: #2a2825; color: #ece8e1; }
  button:focus-visible { outline-color: #e8735f; }
}
`;

function readerLabels() {
  const locale = app.getLocale().toLowerCase();
  if (locale.startsWith('zh')) {
    return {
      title: '微信读书',
      loginHint: '登录一次即可，登录状态只保存在本机，可在设置中退出。',
      dismiss: '知道了',
    };
  }
  if (locale.startsWith('ja')) {
    return {
      title: 'WeRead',
      loginHint:
        'ログインは一度だけで済みます。ログイン状態はこの端末にのみ保存され、設定から削除できます。',
      dismiss: '閉じる',
    };
  }
  return {
    title: 'WeRead',
    loginHint: 'Sign in once. Your sign-in stays on this device and can be cleared in Settings.',
    dismiss: 'Got it',
  };
}
