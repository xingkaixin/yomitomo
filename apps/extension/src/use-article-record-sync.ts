import React, { useCallback, useEffect, useRef } from 'react';
import { browser } from 'wxt/browser';
import type { Annotation, ArticleRecord, PublicAgent, UserProfile } from '@yomitomo/shared';
import { makeId } from '@yomitomo/shared';
import type { ExtractedArticle } from './article-extraction';
import type { DesktopBridge } from './desktop-bridge';
import type { ReaderSettings } from './reader-components';
import {
  clampNumber,
  defaultReaderSettings,
  isNewerArticleRecord,
  toCachedArticleRecord,
} from './reader-utils';

const STORAGE_PREFIX = 'yomitomo.article.';
const LEGACY_STORAGE_PREFIX = 'reader.article.';
const READER_SETTINGS_KEY = 'yomitomo.settings';
const LEGACY_READER_SETTINGS_KEY = 'reader.settings';
const DESKTOP_PROFILE_CACHE_KEY = 'yomitomo.desktopProfile';
const LEGACY_DESKTOP_PROFILE_CACHE_KEY = 'reader.desktopProfile';

type DesktopProfileCache = {
  user: UserProfile;
  agents: PublicAgent[];
};

type UseArticleRecordSyncOptions = {
  extracted: ExtractedArticle;
  desktopBridgeRef: React.MutableRefObject<DesktopBridge | null>;
  desktopAuthenticatedRef: React.MutableRefObject<boolean>;
  annotationsRef: React.MutableRefObject<Annotation[]>;
  articleRecordRef: React.MutableRefObject<ArticleRecord | null>;
  recordCreatedAtRef: React.MutableRefObject<string | null>;
  setAnnotations: (annotations: Annotation[]) => void;
  setAgents: (agents: PublicAgent[]) => void;
  setReaderSettings: (settings: ReaderSettings) => void;
  setUserProfile: (profile: UserProfile) => void;
  normalizeUserProfile: (user: Partial<UserProfile> | undefined) => UserProfile;
  readerLog: (event: string, data?: Record<string, unknown>) => void;
  errorMessage: (error: unknown) => string;
};

export function useArticleRecordSync({
  extracted,
  desktopBridgeRef,
  desktopAuthenticatedRef,
  annotationsRef,
  articleRecordRef,
  recordCreatedAtRef,
  setAnnotations,
  setAgents,
  setReaderSettings,
  setUserProfile,
  normalizeUserProfile,
  readerLog,
  errorMessage,
}: UseArticleRecordSyncOptions) {
  const storageKey = `${STORAGE_PREFIX}${extracted.id}`;
  const legacyStorageKey = `${LEGACY_STORAGE_PREFIX}${extracted.id}`;
  const lastSentArticleSignatureRef = useRef('');

  useEffect(() => {
    browser.storage.local
      .get([
        storageKey,
        legacyStorageKey,
        READER_SETTINGS_KEY,
        LEGACY_READER_SETTINGS_KEY,
        DESKTOP_PROFILE_CACHE_KEY,
        LEGACY_DESKTOP_PROFILE_CACHE_KEY,
      ])
      .then(async (stored) => {
        const loaded = (stored[storageKey] || stored[legacyStorageKey]) as
          | ArticleRecord
          | undefined;
        const migrated: Record<string, unknown> = {};
        const legacyKeys: string[] = [];

        if (!stored[storageKey] && loaded) legacyKeys.push(legacyStorageKey);

        if (loaded) {
          const nextRecord = buildCurrentArticleRecord(
            loaded.annotations || [],
            loaded.createdAt,
            loaded.updatedAt,
          );
          if (applyNewerArticleRecord(nextRecord)) {
            migrated[storageKey] = toCachedArticleRecord(nextRecord);
          }
        }
        const cachedDesktopProfile = (stored[DESKTOP_PROFILE_CACHE_KEY] ||
          stored[LEGACY_DESKTOP_PROFILE_CACHE_KEY]) as DesktopProfileCache | undefined;
        if (!stored[DESKTOP_PROFILE_CACHE_KEY] && cachedDesktopProfile) {
          migrated[DESKTOP_PROFILE_CACHE_KEY] = cachedDesktopProfile;
          legacyKeys.push(LEGACY_DESKTOP_PROFILE_CACHE_KEY);
        }
        if (cachedDesktopProfile) {
          setUserProfile(normalizeUserProfile(cachedDesktopProfile.user));
          setAgents(cachedDesktopProfile.agents || []);
        }
        const savedSettings = (stored[READER_SETTINGS_KEY] ||
          stored[LEGACY_READER_SETTINGS_KEY]) as ReaderSettings | undefined;
        if (!stored[READER_SETTINGS_KEY] && savedSettings) {
          migrated[READER_SETTINGS_KEY] = savedSettings;
          legacyKeys.push(LEGACY_READER_SETTINGS_KEY);
        }
        if (savedSettings) {
          setReaderSettings({
            fontSize: clampNumber(savedSettings.fontSize, 16, 28, defaultReaderSettings.fontSize),
            contentWidth: clampNumber(
              savedSettings.contentWidth,
              680,
              1080,
              defaultReaderSettings.contentWidth,
            ),
          });
        }

        try {
          if (Object.keys(migrated).length > 0) await browser.storage.local.set(migrated);
          if (legacyKeys.length > 0) await browser.storage.local.remove(legacyKeys);
        } catch (error) {
          readerLog('storage.migrate.error', { message: errorMessage(error) });
        }
      });
  }, [legacyStorageKey, storageKey]);

  const applyAnnotations = useCallback(
    (nextAnnotations: Annotation[]) => {
      const now = new Date().toISOString();
      const createdAt = recordCreatedAtRef.current || now;
      const nextRecord = buildCurrentArticleRecord(nextAnnotations, createdAt, now);
      applyArticleRecord(nextRecord);
    },
    [extracted],
  );

  const commitAnnotations = useCallback(
    (nextAnnotations = annotationsRef.current) => {
      const now = new Date().toISOString();
      const createdAt = recordCreatedAtRef.current || now;
      const nextRecord = buildCurrentArticleRecord(nextAnnotations, createdAt, now);
      applyArticleRecord(nextRecord);
      sendArticleRecord(nextRecord);
      void cacheArticleRecord(nextRecord);
    },
    [extracted, storageKey],
  );

  const saveAnnotations = useCallback(
    (nextAnnotations: Annotation[]) => {
      commitAnnotations(nextAnnotations);
    },
    [commitAnnotations],
  );

  function buildCurrentArticleRecord(
    nextAnnotations: Annotation[],
    createdAt: string,
    updatedAt: string,
  ): ArticleRecord {
    return {
      id: extracted.id,
      url: extracted.url,
      canonicalUrl: extracted.canonicalUrl,
      title: extracted.title,
      byline: extracted.byline,
      excerpt: extracted.excerpt,
      contentHtml: extracted.content,
      contentHash: extracted.contentHash,
      annotations: nextAnnotations,
      createdAt,
      updatedAt,
    };
  }

  function applyArticleRecord(record: ArticleRecord) {
    recordCreatedAtRef.current = record.createdAt;
    annotationsRef.current = record.annotations || [];
    articleRecordRef.current = record;
    setAnnotations(record.annotations || []);
  }

  function applyNewerArticleRecord(record: ArticleRecord) {
    const current = articleRecordRef.current;
    if (!isNewerArticleRecord(record, current)) return false;

    applyArticleRecord(record);
    return true;
  }

  async function cacheArticleRecord(record: ArticleRecord) {
    try {
      await browser.storage.local.set({ [storageKey]: toCachedArticleRecord(record) });
    } catch (error) {
      readerLog('storage.cache.error', { message: errorMessage(error) });
    }
  }

  function sendArticleRecord(record: ArticleRecord) {
    const bridge = desktopBridgeRef.current;
    if (!desktopAuthenticatedRef.current) return;
    if (!bridge || bridge.readyState !== WebSocket.OPEN) return;
    lastSentArticleSignatureRef.current = articleAnnotationsSignature(record);
    bridge.send({ type: 'article:save', requestId: makeId('request'), payload: record });
  }

  function sendCurrentArticleRecord() {
    const current = articleRecordRef.current;
    if (!current) return;
    const nextRecord = buildCurrentArticleRecord(
      current.annotations || [],
      current.createdAt,
      current.updatedAt,
    );
    applyArticleRecord(nextRecord);
    sendArticleRecord(nextRecord);
  }

  function requestDesktopArticleRecord() {
    const bridge = desktopBridgeRef.current;
    if (!desktopAuthenticatedRef.current) return;
    if (!bridge || bridge.readyState !== WebSocket.OPEN) return;
    bridge.send({
      type: 'article:get',
      requestId: makeId('request'),
      payload: {
        id: extracted.id,
        url: extracted.url,
        canonicalUrl: extracted.canonicalUrl,
      },
    });
  }

  async function applyDesktopArticleRecord(
    record: ArticleRecord | null,
    options: { backfillLocalChanges?: boolean } = {},
  ) {
    if (!record) {
      sendCurrentArticleRecord();
      return;
    }
    if (!matchesExtractedArticle(record)) return;

    const current = articleRecordRef.current;
    const desktopRecord = buildCurrentArticleRecord(
      record.annotations || [],
      record.createdAt,
      record.updatedAt,
    );
    const nextRecord = current ? mergeArticleRecords(current, desktopRecord) : desktopRecord;
    const changedLocally =
      !current || articleAnnotationsSignature(nextRecord) !== articleAnnotationsSignature(current);
    const changedDesktop =
      articleAnnotationsSignature(nextRecord) !== articleAnnotationsSignature(desktopRecord);

    if (changedLocally || isNewerArticleRecord(nextRecord, current)) {
      applyArticleRecord(nextRecord);
      void cacheArticleRecord(nextRecord);
    }

    if (
      options.backfillLocalChanges &&
      changedDesktop &&
      articleAnnotationsSignature(nextRecord) !== lastSentArticleSignatureRef.current
    ) {
      sendArticleRecord(nextRecord);
    }
  }

  function matchesExtractedArticle(record: ArticleRecord) {
    return (
      record.id === extracted.id ||
      record.canonicalUrl === extracted.canonicalUrl ||
      record.url === extracted.url ||
      record.url === extracted.canonicalUrl ||
      record.canonicalUrl === extracted.url
    );
  }

  async function cacheDesktopProfile(user: UserProfile, agents: PublicAgent[]) {
    await browser.storage.local.set({
      [DESKTOP_PROFILE_CACHE_KEY]: { user, agents } satisfies DesktopProfileCache,
    });
  }

  async function updateReaderSettings(nextSettings: ReaderSettings) {
    setReaderSettings(nextSettings);
    await browser.storage.local.set({ [READER_SETTINGS_KEY]: nextSettings });
  }

  return {
    applyAnnotations,
    applyDesktopArticleRecord,
    cacheDesktopProfile,
    commitAnnotations,
    requestDesktopArticleRecord,
    saveAnnotations,
    updateReaderSettings,
  };
}

function mergeArticleRecords(current: ArticleRecord, desktop: ArticleRecord): ArticleRecord {
  const annotationsById = new Map(
    current.annotations.map((annotation) => [annotation.id, annotation]),
  );
  for (const annotation of desktop.annotations) {
    const currentAnnotation = annotationsById.get(annotation.id);
    annotationsById.set(
      annotation.id,
      currentAnnotation ? mergeAnnotation(currentAnnotation, annotation) : annotation,
    );
  }

  const annotations = Array.from(annotationsById.values()).toSorted(
    (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt),
  );
  const updatedAt = maxIsoDate(current.updatedAt, desktop.updatedAt);
  return {
    ...current,
    annotations,
    createdAt: minIsoDate(current.createdAt, desktop.createdAt),
    updatedAt,
  };
}

function mergeAnnotation(current: Annotation, desktop: Annotation): Annotation {
  const currentWins = Date.parse(current.updatedAt) >= Date.parse(desktop.updatedAt);
  const commentsById = new Map(current.comments.map((comment) => [comment.id, comment]));
  for (const comment of desktop.comments) {
    if (!commentsById.has(comment.id)) commentsById.set(comment.id, comment);
  }

  return {
    ...(currentWins ? current : desktop),
    comments: Array.from(commentsById.values()).toSorted(
      (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt),
    ),
    updatedAt: maxIsoDate(current.updatedAt, desktop.updatedAt),
  };
}

function articleAnnotationsSignature(record: ArticleRecord) {
  return JSON.stringify(
    record.annotations.map((annotation) => ({
      id: annotation.id,
      anchor: annotation.anchor,
      author: annotation.author,
      annotationType: annotation.annotationType,
      color: annotation.color,
      agentId: annotation.agentId,
      agentUsername: annotation.agentUsername,
      agentNickname: annotation.agentNickname,
      agentAvatar: annotation.agentAvatar,
      agentAnnotationColor: annotation.agentAnnotationColor,
      userId: annotation.userId,
      userUsername: annotation.userUsername,
      userNickname: annotation.userNickname,
      userAvatar: annotation.userAvatar,
      userAnnotationColor: annotation.userAnnotationColor,
      comments: annotation.comments.map((comment) => ({
        id: comment.id,
        author: comment.author,
        content: comment.content,
        createdAt: comment.createdAt,
        replyTo: comment.replyTo,
        agentId: comment.agentId,
        agentUsername: comment.agentUsername,
        agentNickname: comment.agentNickname,
        agentAvatar: comment.agentAvatar,
        agentAnnotationColor: comment.agentAnnotationColor,
        userId: comment.userId,
        userUsername: comment.userUsername,
        userNickname: comment.userNickname,
        userAvatar: comment.userAvatar,
        userAnnotationColor: comment.userAnnotationColor,
        pending: comment.pending || undefined,
      })),
    })),
  );
}

function maxIsoDate(left: string, right: string) {
  return Date.parse(left) >= Date.parse(right) ? left : right;
}

function minIsoDate(left: string, right: string) {
  return Date.parse(left) <= Date.parse(right) ? left : right;
}
