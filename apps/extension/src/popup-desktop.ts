import type {
  AppSettings,
  ArticleRecord,
  DesktopClientMessage,
  DesktopServerMessage,
} from '@yomitomo/shared';
import { makeId } from '@yomitomo/shared';
import { browser } from 'wxt/browser';
import {
  DESKTOP_BRIDGE_PORT_NAME,
  type DesktopBridgeContentMessage,
  type DesktopBridgePortMessage,
} from './desktop-bridge';
import { connectExtensionPort } from './extension-runtime';

const POPUP_DESKTOP_TIMEOUT_MS = 3000;

export type PopupDesktopClient = {
  readonly settings: AppSettings;
  getArticle: (
    identity: Pick<ArticleRecord, 'id' | 'url' | 'canonicalUrl'>,
  ) => Promise<ArticleRecord | null>;
  saveArticle: (article: ArticleRecord) => Promise<ArticleRecord>;
  close: () => void;
};

type PendingRequest = {
  expected: DesktopServerMessage['type'];
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

export function connectPopupDesktop(token: string): Promise<PopupDesktopClient> {
  const port = connectExtensionPort(DESKTOP_BRIDGE_PORT_NAME);
  if (!port) return Promise.reject(new Error('扩展上下文已失效'));

  let closed = false;
  let settings: AppSettings = {};
  let connected = false;
  let resolveConnected!: (client: PopupDesktopClient) => void;
  let rejectConnected!: (error: Error) => void;
  const pending = new Map<string, PendingRequest>();

  const client: PopupDesktopClient = {
    get settings() {
      return settings;
    },
    getArticle(identity) {
      return sendRequest(
        'article:get',
        identity,
        'article:get:result',
      ) as Promise<ArticleRecord | null>;
    },
    saveArticle(article) {
      return sendRequest('article:save', article, 'article:save:result') as Promise<ArticleRecord>;
    },
    close,
  };

  const timeout = setTimeout(() => {
    failConnect(new Error('桌面端连接超时'));
    close();
  }, POPUP_DESKTOP_TIMEOUT_MS);

  const promise = new Promise<PopupDesktopClient>((resolve, reject) => {
    resolveConnected = resolve;
    rejectConnected = reject;
  });

  port.onMessage.addListener((message: DesktopBridgeContentMessage) => {
    if (message.type === 'desktop:message') {
      handleDesktopMessage(message.message);
      return;
    }

    if (message.type === 'desktop:error') {
      const error = new Error(message.message);
      failConnect(error);
      rejectPending(error);
      return;
    }

    if (message.type === 'desktop:send:failed') {
      rejectRequest(message.message);
      return;
    }

    if (message.type === 'desktop:close') {
      const error = new Error('桌面端连接已关闭');
      failConnect(new Error('桌面端未连通'));
      rejectPending(error);
      close();
    }
  });

  port.onDisconnect.addListener(() => {
    closed = true;
    clearTimeout(timeout);
    failConnect(new Error('桌面端连接已关闭'));
    rejectPending(new Error('桌面端连接已关闭'));
  });

  port.postMessage({
    type: 'desktop:connect',
    token: token.trim(),
  } satisfies DesktopBridgePortMessage);

  return promise;

  function handleDesktopMessage(message: DesktopServerMessage) {
    if (message.type === 'auth:result') {
      if (!message.ok) {
        failConnect(new Error(message.message || '配对失败'));
        close();
        return;
      }
      send({ type: 'hello', extensionVersion: browser.runtime.getManifest().version });
      return;
    }

    if (message.type === 'status') {
      settings = message.settings || {};
      if (!connected) {
        connected = true;
        clearTimeout(timeout);
        resolveConnected(client);
      }
      return;
    }

    if (message.type === 'article:get:result') {
      resolveRequest(message.requestId, message.type, message.article);
      return;
    }

    if (message.type === 'article:save:result') {
      resolveRequest(message.requestId, message.type, message.article);
      return;
    }

    if (message.type === 'error') {
      const error = new Error(message.message);
      if (message.requestId) {
        const request = pending.get(message.requestId);
        if (request) {
          pending.delete(message.requestId);
          request.reject(error);
          return;
        }
      }
      failConnect(error);
    }
  }

  function sendRequest(
    type: 'article:get',
    payload: Pick<ArticleRecord, 'id' | 'url' | 'canonicalUrl'>,
    expected: 'article:get:result',
  ): Promise<ArticleRecord | null>;
  function sendRequest(
    type: 'article:save',
    payload: ArticleRecord,
    expected: 'article:save:result',
  ): Promise<ArticleRecord>;
  function sendRequest(
    type: 'article:get' | 'article:save',
    payload: Pick<ArticleRecord, 'id' | 'url' | 'canonicalUrl'> | ArticleRecord,
    expected: 'article:get:result' | 'article:save:result',
  ) {
    if (closed) return Promise.reject(new Error('桌面端连接已关闭'));
    const requestId = makeId('request');
    const message: DesktopClientMessage =
      type === 'article:get'
        ? {
            type,
            requestId,
            payload: payload as Pick<ArticleRecord, 'id' | 'url' | 'canonicalUrl'>,
          }
        : { type, requestId, payload: payload as ArticleRecord };

    return new Promise((resolve, reject) => {
      pending.set(requestId, { expected, resolve, reject });
      send(message);
    });
  }

  function send(message: DesktopClientMessage) {
    port.postMessage({ type: 'desktop:send', message } satisfies DesktopBridgePortMessage);
  }

  function resolveRequest(requestId: string, type: DesktopServerMessage['type'], value: unknown) {
    const request = pending.get(requestId);
    if (!request || request.expected !== type) return;
    pending.delete(requestId);
    request.resolve(value);
  }

  function rejectRequest(message: DesktopClientMessage) {
    if (!('requestId' in message)) return;
    const request = pending.get(message.requestId);
    if (!request) return;
    pending.delete(message.requestId);
    request.reject(new Error('桌面端发送失败'));
  }

  function failConnect(error: Error) {
    if (connected) return;
    clearTimeout(timeout);
    rejectConnected(error);
  }

  function rejectPending(error: Error) {
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  }

  function close() {
    if (closed) return;
    closed = true;
    clearTimeout(timeout);
    port.postMessage({ type: 'desktop:disconnect' } satisfies DesktopBridgePortMessage);
    port.disconnect();
  }
}
