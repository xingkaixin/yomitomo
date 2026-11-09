import { app, session, WebContentsView, type BrowserWindow, type WebContents } from 'electron';
import { isWeReadReaderUrl } from '../weread/weread-protocol';

// 不能以 yomitomo-import 开头：缓存清理会删除那个前缀下的 partition，登录态会随之丢失。
const WEREAD_READER_PARTITION = 'persist:weread-reader';
const WEREAD_READER_ORIGIN = 'https://weread.qq.com/';
// 网页版只通过这个接口写账号的阅读位置和阅读时长：页面打开约 1 秒时一次，之后约每 30 秒一次。
const PROGRESS_REPORT_URL = 'https://weread.qq.com/web/book/read';
// 提示浮层在独立的 isolated world 里运行，网页版的脚本拿不到它的变量和事件处理函数。
const NOTICE_WORLD_ID = 1037;
const NOTICE_ELEMENT_ID = 'yomitomo-reader-notice';
// 定位依赖网页版的这两个 class 名；网页版改版后定位会失败并停在章节，打开阅读器本身不受影响。
const NOTE_PANEL_BUTTON_SELECTOR = '.readerControls_item.wr_note';
const NOTE_PANEL_ENTRY_SELECTOR = '.wr_reader_note_panel_item_cell_wrapper';
// 网页版把工具栏放在正文区右侧之外，小窗宽度不够时笔记按钮落在视口外点不到；定位期间临时挪进正文区。
const LOCATE_CONTROLS_CSS =
  '.readerControls { left: auto !important; right: 12px !important; margin-left: 0 !important; }';
const READER_READY_TIMEOUT_MS = 10_000;
const NOTE_PANEL_TIMEOUT_MS = 5_000;
const POLL_INTERVAL_MS = 250;
// 网页版按桌面宽度排版，小窗里按比例缩小整页，而不是让它挤成窄屏布局。
const COMPACT_ZOOM_FACTOR = 0.7;
const COMPACT_BORDER_RADIUS = 10;

type OpenExternalUrl = (url: string) => Promise<void>;

export type WeReadReaderBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
  compact: boolean;
};

type ReaderNotice = {
  text: string;
  actionLabel: string;
};

type ViewportPoint = { x: number; y: number };

type NotePanelEntry =
  | { state: 'pending' }
  | { state: 'missing' }
  | ({ state: 'found' } & ViewportPoint);

type Reader = { view: WebContentsView; window: BrowserWindow; release: () => void };

let reader: Reader | null = null;
let readerBounds: WeReadReaderBounds | null = null;
let locateRequest = 0;

export async function openWeReadReader(
  window: BrowserWindow,
  url: string,
  openExternalUrl: OpenExternalUrl,
  highlightText?: string,
) {
  const request = ++locateRequest;
  const contents = (reader?.window === window ? reader : createReader(window, openExternalUrl)).view
    .webContents;
  contents.focus();
  const loaded = await loadReaderUrl(contents, url);
  if (!loaded) return;
  const labels = readerLabels();
  if (!(await hasWeReadWebLogin())) {
    await showReaderNotice(contents, { text: labels.loginHint, actionLabel: labels.dismiss });
    return;
  }
  if (!highlightText) return;
  void locateHighlight(contents, highlightText, () => request !== locateRequest);
}

export function setWeReadReaderBounds(bounds: WeReadReaderBounds | null) {
  readerBounds = bounds;
  if (reader) applyReaderBounds(reader.view);
}

// 占位区域的位置由页面上报，这里不清空：页面可能先上报位置、再请求打开，视图重建后仍要用它。
// 网页版用左右方向键翻页；按键发给视图本身，不需要用户先点进小窗。
export function turnWeReadReaderPage(direction: 'left' | 'right') {
  const contents = reader?.view.webContents;
  if (!contents || contents.isDestroyed()) return;
  const keyCode = direction === 'left' ? 'Left' : 'Right';
  contents.sendInputEvent({ type: 'keyDown', keyCode });
  contents.sendInputEvent({ type: 'keyUp', keyCode });
}

export function closeWeReadReader() {
  const current = reader;
  reader = null;
  if (!current) return;
  current.release();
  if (!current.window.isDestroyed()) current.window.contentView.removeChildView(current.view);
  if (!current.view.webContents.isDestroyed()) current.view.webContents.close();
}

export async function hasWeReadWebLogin() {
  const cookies = await readerSession().cookies.get({ url: WEREAD_READER_ORIGIN, name: 'wr_vid' });
  return cookies.length > 0;
}

export async function clearWeReadWebLogin() {
  closeWeReadReader();
  const readerStorage = readerSession();
  await Promise.all([readerStorage.clearStorageData(), readerStorage.clearCache()]);
}

function readerSession() {
  return session.fromPartition(WEREAD_READER_PARTITION);
}

function createReader(window: BrowserWindow, openExternalUrl: OpenExternalUrl): Reader {
  closeWeReadReader();
  const view = new WebContentsView({
    webPreferences: {
      partition: WEREAD_READER_PARTITION,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  view.setVisible(false);
  window.contentView.addChildView(view);
  // 窗口关闭时 window.webContents 已经销毁，读它会抛错；创建时先取好宿主页面。
  const host = window.webContents;
  const closeWithHost = () => {
    readerBounds = null;
    closeWeReadReader();
  };
  const created: Reader = {
    view,
    window,
    release: () => {
      window.off('closed', closeWithHost);
      host.off('did-navigate', closeWithHost);
    },
  };
  reader = created;
  window.once('closed', closeWithHost);
  // 主窗口页面重新加载后，原来的占位区域已经不存在，留着的视图会盖在新页面上。
  host.once('did-navigate', closeWithHost);
  guardReaderContents(view.webContents, openExternalUrl);
  applyReaderBounds(view);
  return created;
}

function applyReaderBounds(view: WebContentsView) {
  const bounds = readerBounds;
  if (!bounds) {
    view.setVisible(false);
    return;
  }
  view.setBounds({
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height),
  });
  view.setBorderRadius(bounds.compact ? COMPACT_BORDER_RADIUS : 0);
  if (!view.webContents.isDestroyed()) {
    view.webContents.setZoomFactor(bounds.compact ? COMPACT_ZOOM_FACTOR : 1);
  }
  view.setVisible(true);
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
  // 小窗用来翻划线，定位、跳章节和翻页都不该改动账号进度；只有全屏显示时才算在读，进度照常上报。
  contents.session.webRequest.onBeforeRequest(
    { urls: [`${PROGRESS_REPORT_URL}*`] },
    (details, callback) => {
      const reportsProgress =
        details.method === 'POST' && details.url.split('?')[0] === PROGRESS_REPORT_URL;
      callback({ cancel: reportsProgress && readerBounds?.compact !== false });
    },
  );
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

async function locateHighlight(
  contents: WebContents,
  highlightText: string,
  superseded: () => boolean,
) {
  const labels = readerLabels();
  await showReaderNotice(contents, { text: labels.locating, actionLabel: labels.stop });
  const canceled = async () =>
    superseded() || contents.isDestroyed() || !(await readerNoticeVisible(contents));
  const located = await clickNotePanelEntry(contents, highlightText, canceled);
  if (located === 'canceled' || superseded()) return;
  // 定位不到时停在对应章节，不再提示失败：多数情况下用户已经能看到这条划线附近的内容。
  await showReaderNotice(contents, null);
}

async function clickNotePanelEntry(
  contents: WebContents,
  highlightText: string,
  canceled: () => Promise<boolean>,
): Promise<'clicked' | 'failed' | 'canceled'> {
  const controlsCss = await contents.insertCSS(LOCATE_CONTROLS_CSS).catch(() => null);
  try {
    return await clickNotePanelEntryInView(contents, highlightText, canceled);
  } finally {
    if (controlsCss && !contents.isDestroyed()) {
      await contents.removeInsertedCSS(controlsCss).catch(() => undefined);
    }
  }
}

async function clickNotePanelEntryInView(
  contents: WebContents,
  highlightText: string,
  canceled: () => Promise<boolean>,
): Promise<'clicked' | 'failed' | 'canceled'> {
  if (!(await readerPoint(contents, notePanelOpenScript()))) {
    const button = await pollReader(
      contents,
      () => readerPoint(contents, notePanelButtonScript()),
      READER_READY_TIMEOUT_MS,
      canceled,
    );
    if (button === 'canceled') return 'canceled';
    if (!button) return 'failed';
    // 网页版不响应页面脚本里的 element.click()，只认真实的鼠标事件。
    clickAt(contents, button);
  }
  let previous: ViewportPoint | null = null;
  const entry = await pollReader(
    contents,
    async () => {
      const result = await runInReader<NotePanelEntry>(
        contents,
        notePanelEntryScript(highlightText),
      );
      if (!result || result.state === 'pending') {
        previous = null;
        return null;
      }
      if (result.state === 'missing') return result;
      // 页面刚加载完或面板还在展开时，网页版会吞掉点击；连续两次读到同一位置才点。
      const settled =
        previous !== null &&
        Math.abs(previous.x - result.x) < 1 &&
        Math.abs(previous.y - result.y) < 1;
      previous = { x: result.x, y: result.y };
      return settled ? result : null;
    },
    NOTE_PANEL_TIMEOUT_MS,
    canceled,
  );
  if (entry === 'canceled') return 'canceled';
  if (!entry || entry.state !== 'found') return 'failed';
  clickAt(contents, entry);
  return 'clicked';
}

async function pollReader<T>(
  contents: WebContents,
  read: () => Promise<T | null>,
  timeoutMs: number,
  canceled: () => Promise<boolean>,
): Promise<T | null | 'canceled'> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await canceled()) return 'canceled';
    const value = await read();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return contents.isDestroyed() ? 'canceled' : null;
}

function clickAt(contents: WebContents, point: ViewportPoint) {
  if (contents.isDestroyed()) return;
  // 页面坐标是缩放后的 CSS 像素，输入事件要用视图坐标。
  const zoom = contents.getZoomFactor();
  const x = Math.round(point.x * zoom);
  const y = Math.round(point.y * zoom);
  contents.sendInputEvent({ type: 'mouseMove', x, y });
  contents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
  contents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
}

async function readerPoint(contents: WebContents, code: string) {
  return runInReader<ViewportPoint>(contents, code);
}

async function readerNoticeVisible(contents: WebContents) {
  return (
    (await runInReader<boolean>(
      contents,
      `document.getElementById(${JSON.stringify(NOTICE_ELEMENT_ID)}) !== null`,
    )) === true
  );
}

async function runInReader<T>(contents: WebContents, code: string): Promise<T | null> {
  if (contents.isDestroyed()) return null;
  try {
    return ((await contents.executeJavaScriptInIsolatedWorld(NOTICE_WORLD_ID, [{ code }])) ??
      null) as T | null;
  } catch {
    return null;
  }
}

const VISIBLE_CENTER_SCRIPT = `(element) => {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const x = Math.round(rect.left + rect.width / 2);
  const y = Math.round(rect.top + rect.height / 2);
  if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return null;
  return { x, y };
}`;

function notePanelButtonScript() {
  return `(${VISIBLE_CENTER_SCRIPT})(document.querySelector(${JSON.stringify(NOTE_PANEL_BUTTON_SELECTOR)}))`;
}

function notePanelOpenScript() {
  return `(${VISIBLE_CENTER_SCRIPT})(document.querySelector(${JSON.stringify(NOTE_PANEL_ENTRY_SELECTOR)}))`;
}

function notePanelEntryScript(highlightText: string) {
  return `(() => {
  const visibleCenter = ${VISIBLE_CENTER_SCRIPT};
  // 同步数据和网页版对空白、零宽字符和引号的写法不一致，比较前统一去掉或归一。
  const normalize = (value) => value
    .replace(/[\\s\\u200b-\\u200d\\ufeff]/g, '')
    .replace(/[“”„‟]/g, '"')
    .replace(/[‘’]/g, "'");
  const target = normalize(${JSON.stringify(highlightText)});
  // 面板关着时条目已经在 DOM 里但没有尺寸；只认可见的条目，面板展开前继续等待。
  const entries = Array.from(document.querySelectorAll(${JSON.stringify(NOTE_PANEL_ENTRY_SELECTOR)}))
    .filter((entry) => entry.getBoundingClientRect().height > 0);
  if (entries.length === 0) return { state: 'pending' };
  const texts = entries.map((entry) => normalize(entry.textContent || ''));
  let matches = entries.filter((_, index) => texts[index] === target);
  if (matches.length === 0) {
    matches = entries.filter((_, index) => texts[index].includes(target));
  }
  if (matches.length !== 1) return { state: 'missing' };
  matches[0].scrollIntoView({ block: 'center' });
  const point = visibleCenter(matches[0]);
  return point ? { state: 'found', ...point } : { state: 'pending' };
})()`;
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
      loginHint: '登录一次即可，登录状态只保存在本机，可在设置中退出。',
      dismiss: '知道了',
      locating: '正在定位划线',
      stop: '停止',
    };
  }
  if (locale.startsWith('ja')) {
    return {
      loginHint:
        'ログインは一度だけで済みます。ログイン状態はこの端末にのみ保存され、設定から削除できます。',
      dismiss: '閉じる',
      locating: 'ハイライトを探しています',
      stop: '停止',
    };
  }
  return {
    loginHint: 'Sign in once. Your sign-in stays on this device and can be cleared in Settings.',
    dismiss: 'Got it',
    locating: 'Finding your highlight',
    stop: 'Stop',
  };
}
