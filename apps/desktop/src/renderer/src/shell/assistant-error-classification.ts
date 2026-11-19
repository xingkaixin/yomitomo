import i18next from 'i18next';
import type { AssistantRunEvent } from '@yomitomo/shared';
import { desktopIpcErrorCodes, isDesktopIpcErrorLike } from '../../../ipc-errors';

export type AssistantFailureKind =
  | 'provider_unconfigured'
  | 'auth_failed'
  | 'insufficient_balance'
  | 'rate_limited'
  | 'network_error'
  | 'aborted'
  | 'unknown';

export type AssistantFailureInfo = {
  kind: AssistantFailureKind;
  message: string;
  canRetry: boolean;
  openSettings: boolean;
};

const INTERNAL_RUN_ERROR_CODES = new Set([
  'channel_deleted',
  'empty_answer',
  'faulted',
  'fork_missing',
  'interrupted',
  'model_error',
  'not_started',
  'nothing_to_answer',
  'orphaned',
  'reset',
  'restart_limit',
  'run_failed',
  'turn_limit',
  'unanswered',
]);

const ABORTED_PATTERN = /\b(aborted|abort(?:error)?|cancelled|canceled)\b/i;
const INSUFFICIENT_BALANCE_PATTERN =
  /\b402\b|insufficient[_\s-]*(balance|quota|funds|credit)|payment\s*required|out\s*of\s*credit|billing[_\s-]*(limit|hard|not)|余额不足|欠费|残高不足/i;
const RATE_LIMIT_PATTERN =
  /\b429\b|rate[_\s-]*limit|too\s*many\s*requests|throttl(?:ed|ing)|请求过于频繁|限流|レート制限/i;
const AUTH_FAILED_PATTERN =
  /\b401\b|\b403\b|invalid[_\s-]*api[_\s-]*key|incorrect\s*api\s*key|authentication|unauthorized|forbidden|permission\s*denied|invalid\s*token|api[_\s-]*key.*(?:invalid|expired|missing|revoked)/i;
const PROVIDER_UNCONFIGURED_PATTERN =
  /\bno[_\s-]*model\b|model[_\s-]*not[_\s-]*found|provider[_\s-]*(?:not[_\s-]*(?:configured|found)|route[_\s-]*required)|api[_\s-]*key[_\s-]*required/i;
const NETWORK_ERROR_PATTERN =
  /timeout|timed\s*out|\betimedout\b|\beconnrefused\b|\beconnreset\b|\benotfound\b|\behostunreach\b|\benetunreach\b|\beai_again\b|fetch\s*failed|failed\s*to\s*fetch|network\s*(?:error|failed|unreachable)|socket\s*hang\s*up|\b502\b|\b503\b|\b504\b|service\s*unavailable|bad\s*gateway|gateway\s*timeout/i;

export function classifyAssistantError(error: unknown, fallbackKey: string): AssistantFailureInfo {
  const ipc = classifyDesktopIpcError(error);
  if (ipc) return ipc;

  if (isDesktopIpcErrorLike(error)) {
    return classifyRawFailure(error.message, undefined, fallbackKey);
  }
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return classifyRawFailure(message, undefined, fallbackKey);
}

export function classifyAssistantRunFailure(
  event: Pick<AssistantRunEvent, 'error' | 'errorDetail'> | null | undefined,
  fallbackKey: string,
): AssistantFailureInfo {
  return classifyRawFailure(event?.errorDetail, event?.error, fallbackKey);
}

export function detectAssistantFailureKind(detail?: string, reason?: string): AssistantFailureKind {
  if (reason === 'no_model') return 'provider_unconfigured';
  if (reason === 'aborted') return 'aborted';

  const text = [detail, reason].filter(Boolean).join(' ').trim();
  if (!text) return 'unknown';
  if (ABORTED_PATTERN.test(text)) return 'aborted';
  if (INSUFFICIENT_BALANCE_PATTERN.test(text)) return 'insufficient_balance';
  if (RATE_LIMIT_PATTERN.test(text)) return 'rate_limited';
  if (AUTH_FAILED_PATTERN.test(text)) return 'auth_failed';
  if (PROVIDER_UNCONFIGURED_PATTERN.test(text)) return 'provider_unconfigured';
  if (NETWORK_ERROR_PATTERN.test(text)) return 'network_error';
  return 'unknown';
}

function classifyDesktopIpcError(error: unknown): AssistantFailureInfo | null {
  if (!isDesktopIpcErrorLike(error)) return null;
  const username = typeof error.detail?.username === 'string' ? error.detail.username : '';
  const name = username ? `@${username}` : '';
  if (error.code === desktopIpcErrorCodes.agentNotFound) {
    return {
      kind: 'unknown',
      message: i18next.t('assistantErrors.agentNotFound', { name }),
      canRetry: false,
      openSettings: false,
    };
  }
  if (error.code === desktopIpcErrorCodes.reviewAgentNotFound) {
    return {
      kind: 'unknown',
      message: i18next.t('assistantErrors.reviewAgentNotFound', { name }),
      canRetry: false,
      openSettings: false,
    };
  }
  if (error.code === desktopIpcErrorCodes.providerRouteRequired) {
    const task = typeof error.detail?.task === 'string' ? error.detail.task : '';
    const message =
      task === 'readingAssistant'
        ? i18next.t('settings.models.readingProviderRouteRequired')
        : task === 'reviewAssistant'
          ? i18next.t('settings.models.reviewProviderRouteRequired')
          : task === 'bilingualTranslation'
            ? i18next.t('settings.models.translationProviderRouteRequired')
            : i18next.t('assistantErrors.providerUnconfigured');
    return { kind: 'provider_unconfigured', message, canRetry: true, openSettings: true };
  }
  if (error.code === desktopIpcErrorCodes.providerApiKeyRequired) {
    return {
      kind: 'provider_unconfigured',
      message: i18next.t('settings.models.providerApiKeyRequired'),
      canRetry: true,
      openSettings: true,
    };
  }
  return null;
}

function classifyRawFailure(
  detail: string | undefined,
  reason: string | undefined,
  fallbackKey: string,
): AssistantFailureInfo {
  const kind = detectAssistantFailureKind(detail, reason);
  switch (kind) {
    case 'provider_unconfigured':
      return {
        kind,
        message: i18next.t('assistantErrors.providerUnconfigured'),
        canRetry: true,
        openSettings: true,
      };
    case 'auth_failed':
      return {
        kind,
        message: i18next.t('assistantErrors.authFailed'),
        canRetry: true,
        openSettings: true,
      };
    case 'insufficient_balance':
      return {
        kind,
        message: i18next.t('assistantErrors.insufficientBalance'),
        canRetry: true,
        openSettings: false,
      };
    case 'rate_limited':
      return {
        kind,
        message: i18next.t('assistantErrors.rateLimited'),
        canRetry: true,
        openSettings: false,
      };
    case 'network_error':
      return {
        kind,
        message: i18next.t('assistantErrors.networkError'),
        canRetry: true,
        openSettings: false,
      };
    case 'aborted':
      return {
        kind,
        message: i18next.t('assistantErrors.aborted'),
        canRetry: true,
        openSettings: false,
      };
    case 'unknown': {
      const cleanedDetail = detail?.trim();
      const message =
        cleanedDetail && !INTERNAL_RUN_ERROR_CODES.has(cleanedDetail)
          ? cleanedDetail
          : i18next.t(fallbackKey);
      return { kind, message, canRetry: true, openSettings: false };
    }
  }
}
