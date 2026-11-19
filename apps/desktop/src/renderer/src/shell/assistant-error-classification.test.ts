import { beforeEach, describe, expect, it } from 'vitest';
import { DesktopIpcError, desktopIpcErrorCodes } from '../../../ipc-errors';
import { initializeAppI18n } from '../i18n/app-i18n';
import {
  classifyAssistantError,
  classifyAssistantRunFailure,
  detectAssistantFailureKind,
} from './assistant-error-classification';

beforeEach(() => {
  initializeAppI18n('zh-CN');
});

describe('assistant error classification', () => {
  it('classifies unconfigured provider route and missing API key IPC errors with settings CTA', () => {
    const routeErr = classifyAssistantError(
      new DesktopIpcError(desktopIpcErrorCodes.providerRouteRequired, 'missing', {
        detail: { task: 'readingAssistant' },
      }),
      'discussion.replyFailed',
    );
    expect(routeErr.kind).toBe('provider_unconfigured');
    expect(routeErr.openSettings).toBe(true);
    expect(routeErr.canRetry).toBe(true);

    const keyErr = classifyAssistantError(
      new DesktopIpcError(desktopIpcErrorCodes.providerApiKeyRequired, 'missing'),
      'discussion.replyFailed',
    );
    expect(keyErr.kind).toBe('provider_unconfigured');
    expect(keyErr.openSettings).toBe(true);
  });

  it('distinguishes auth, insufficient balance, 429 rate limit, network timeout, and abort', () => {
    expect(detectAssistantFailureKind('HTTP 401 Incorrect API key provided')).toBe('auth_failed');
    expect(detectAssistantFailureKind('403 Forbidden: invalid_api_key')).toBe('auth_failed');
    expect(
      detectAssistantFailureKind('429 You exceeded your current quota: insufficient_quota'),
    ).toBe('insufficient_balance');
    expect(detectAssistantFailureKind('402 Payment Required: Insufficient Balance')).toBe(
      'insufficient_balance',
    );
    expect(detectAssistantFailureKind('429 Too Many Requests: rate_limit_exceeded')).toBe(
      'rate_limited',
    );
    expect(detectAssistantFailureKind('fetch failed: ECONNREFUSED 127.0.0.1')).toBe(
      'network_error',
    );
    expect(detectAssistantFailureKind('Request timed out after 120000ms')).toBe('network_error');
    expect(detectAssistantFailureKind(undefined, 'aborted')).toBe('aborted');
    expect(detectAssistantFailureKind(undefined, 'no_model')).toBe('provider_unconfigured');
  });

  it('uses fallback copy for internal run codes and preserves specific failure copy for run details', () => {
    const empty = classifyAssistantRunFailure({ error: 'empty_answer' }, 'source.readerChatFailed');
    expect(empty).toMatchObject({
      kind: 'unknown',
      message: '问答请求失败，请稍后重试',
      canRetry: true,
      openSettings: false,
    });

    const rateLimited = classifyAssistantRunFailure(
      { error: 'model_error', errorDetail: '429 Too Many Requests' },
      'discussion.replyFailed',
    );
    expect(rateLimited.kind).toBe('rate_limited');
    expect(rateLimited.canRetry).toBe(true);
    expect(rateLimited.openSettings).toBe(false);
    expect(rateLimited.message).toContain('429');

    const auth = classifyAssistantRunFailure(
      { error: 'model_error', errorDetail: '401 Unauthorized' },
      'discussion.replyFailed',
    );
    expect(auth.kind).toBe('auth_failed');
    expect(auth.openSettings).toBe(true);
  });
});
