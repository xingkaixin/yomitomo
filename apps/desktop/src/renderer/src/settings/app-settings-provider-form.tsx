import { HugeiconsIcon } from '@hugeicons/react';
import {
  Delete02Icon,
  Logout01Icon,
  Tick01Icon,
  ViewIcon,
  ViewOffIcon,
} from '@hugeicons/core-free-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useReducer, useRef } from 'react';
import { useMountEffect } from '@yomitomo/reader-ui/use-mount-effect';
import {
  isChatGptOAuthProvider,
  providerPresets,
  resolveThinkingEffort,
  type ChatGptAccountState,
  type ProviderPreset,
  type ProviderThinkingCapabilities,
  type ThinkingEffortOption,
} from '@yomitomo/shared';
import type { ProviderDraft } from './app-settings';
import { providerLogoMap } from './app-settings-provider-assets';
import { useProviderModelFetch } from './app-settings-provider-model-fetch';
import { ProviderModelFields } from './app-settings-provider-model-fields';
import { Button } from '../components/ui/button';
import { Field } from '../components/ui/field';
import { Input } from '../components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { useTranslation } from 'react-i18next';
import { providerPresetDisplayName } from '../i18n/app-i18n-labels';
import { getDesktopApi, getOptionalDesktopApi } from '../shell/app-desktop-api';

const CHATGPT_AUTH_STATUS_QUERY_KEY = ['provider', 'chatgpt-auth-status'] as const;
const DISCONNECTED_CHATGPT_ACCOUNT: ChatGptAccountState = { status: 'disconnected' };
const EMPTY_THINKING_CAPABILITIES: ProviderThinkingCapabilities = {
  supportedEfforts: [],
  defaultEffort: 'none',
};

export function providerDraftFromPreset(
  draft: ProviderDraft,
  preset: ProviderPreset,
): ProviderDraft {
  const isChatGpt = preset.id === 'chatgpt';
  return {
    ...draft,
    presetId: preset.id,
    name: providerPresetDisplayName(preset.id, preset.name),
    type: preset.type,
    logo: preset.logo,
    baseUrl: preset.baseUrl,
    // Account-specific ChatGPT catalogs must come from the signed-in account, not static presets.
    modelName: isChatGpt ? '' : preset.modelName,
    modelNames: isChatGpt ? [] : preset.modelNames,
    modelInputMode: 'list',
    reasoningEffort: 'none',
  };
}

export function ProviderForm({
  draft,
  onChange,
  selectContentClassName = 'theme-select-content',
  showNameField = true,
  showProviderIdentityFields = true,
}: {
  draft: ProviderDraft;
  onChange: (draft: ProviderDraft) => void;
  selectContentClassName?: string;
  showNameField?: boolean;
  showProviderIdentityFields?: boolean;
}) {
  const { t } = useTranslation();
  const isChatGpt = isChatGptOAuthProvider(draft);
  const queryClient = useQueryClient();
  const { data: chatGptAccount = DISCONNECTED_CHATGPT_ACCOUNT } = useQuery({
    queryKey: CHATGPT_AUTH_STATUS_QUERY_KEY,
    queryFn: () => {
      const api = getOptionalDesktopApi()?.provider?.getChatGptAuthStatus;
      return api ? api() : Promise.resolve(DISCONNECTED_CHATGPT_ACCOUNT);
    },
    enabled: isChatGpt,
  });
  const modelKey = draft.modelName?.trim() || '';
  const { data: thinkingCapabilities = EMPTY_THINKING_CAPABILITIES } = useQuery({
    queryKey: [
      'provider',
      'thinking-levels',
      draft.presetId || '',
      draft.type || '',
      draft.baseUrl || '',
      modelKey,
      draft.modelNames?.length ?? 0,
    ],
    queryFn: () => {
      const api = getOptionalDesktopApi()?.provider?.getThinkingLevels;
      return api ? api(draft) : Promise.resolve(EMPTY_THINKING_CAPABILITIES);
    },
    enabled: Boolean(modelKey),
  });
  const supportedThinkingEfforts = thinkingCapabilities.supportedEfforts;
  const selectedThinkingEffort: ThinkingEffortOption = resolveThinkingEffort(
    supportedThinkingEfforts,
    draft.reasoningEffort,
    thinkingCapabilities.defaultEffort,
  );
  const {
    fetchModels,
    clearModelStatus,
    modelError,
    modelLoading,
    modelNotice,
    presetModels,
    visibleModels,
  } = useProviderModelFetch(draft, onChange, {
    chatGptConnected: chatGptAccount.status === 'connected',
  });

  function applyPreset(presetId: string) {
    const preset = providerPresets.find((item) => item.id === presetId);
    if (!preset) return;
    clearModelStatus();
    const nextDraft = providerDraftFromPreset(draft, preset);
    onChange(nextDraft);
    if (preset.id === 'chatgpt' && chatGptAccount.status === 'connected') {
      void fetchModels({ draft: nextDraft, forceConnected: true });
    }
  }

  function handleChatGptConnected(nextState: ChatGptAccountState) {
    queryClient.setQueryData(CHATGPT_AUTH_STATUS_QUERY_KEY, nextState);
    if (nextState.status === 'connected') {
      void fetchModels({ forceConnected: true });
    }
  }

  function handleChatGptDisconnected(nextState: ChatGptAccountState) {
    queryClient.setQueryData(CHATGPT_AUTH_STATUS_QUERY_KEY, nextState);
    void queryClient.invalidateQueries({ queryKey: ['provider', 'thinking-levels'] });
  }

  const selectedPreset = providerPresets.find((preset) => preset.id === draft.presetId);
  const storedKeyProviderId = draft.id || draft.cloneApiKeyFromProviderId;

  return (
    <div className="settings-form-grid">
      {showProviderIdentityFields ? (
        <Field
          id="provider-preset"
          className="col-span-2"
          label={t('settings.models.presetProvider')}
        >
          <Select value={draft.presetId || ''} onValueChange={applyPreset}>
            <SelectTrigger
              id="provider-preset"
              aria-labelledby="provider-preset-label"
              className="provider-select-trigger"
            >
              <SelectValue placeholder={t('settings.models.chooseProviderPreset')}>
                {selectedPreset ? (
                  <span className="provider-preset-item">
                    <img
                      className="provider-preset-logo"
                      src={providerLogoMap[selectedPreset.logo]}
                      alt=""
                    />
                    {providerPresetDisplayName(selectedPreset.id, selectedPreset.name)}
                  </span>
                ) : undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className={selectContentClassName}>
              <SelectGroup>
                {providerPresets.map((preset) => (
                  <SelectItem key={preset.id} value={preset.id}>
                    <span className="provider-preset-item">
                      <img
                        className="provider-preset-logo"
                        src={providerLogoMap[preset.logo]}
                        alt=""
                      />
                      {providerPresetDisplayName(preset.id, preset.name)}
                    </span>
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      ) : null}
      {showProviderIdentityFields || showNameField ? (
        <Field
          id="provider-name"
          className={showProviderIdentityFields ? undefined : 'col-span-2'}
          label={t('settings.models.providerName')}
        >
          <Input
            id="provider-name"
            name="provider-name"
            autoComplete="off"
            value={draft.name || ''}
            onChange={(event) => onChange({ ...draft, name: event.target.value })}
          />
        </Field>
      ) : null}
      {isChatGpt ? (
        <Field
          id="provider-chatgpt-account"
          className="col-span-2"
          label={t('settings.models.chatGptAccount')}
        >
          <ChatGptAccountField
            account={chatGptAccount}
            onConnected={handleChatGptConnected}
            onDisconnected={handleChatGptDisconnected}
          />
        </Field>
      ) : (
        <Field id="provider-base-url" label="Base URL">
          <Input
            id="provider-base-url"
            name="provider-base-url"
            type="url"
            autoComplete="off"
            value={draft.baseUrl || ''}
            onChange={(event) => onChange({ ...draft, baseUrl: event.target.value })}
          />
        </Field>
      )}
      <ProviderModelFields
        className={isChatGpt ? 'col-span-2' : undefined}
        draft={draft}
        modelError={modelError}
        modelLoading={modelLoading}
        modelNotice={modelNotice}
        presetModels={presetModels}
        visibleModels={visibleModels}
        onChange={onChange}
        onFetchModels={fetchModels}
      />
      {supportedThinkingEfforts.length > 0 ? (
        <Field id="provider-thinking" className="col-span-2" label={t('settings.models.thinking')}>
          <Select
            value={selectedThinkingEffort}
            onValueChange={(value) =>
              onChange({ ...draft, reasoningEffort: value as ThinkingEffortOption })
            }
          >
            <SelectTrigger id="provider-thinking" aria-labelledby="provider-thinking-label">
              <SelectValue>
                {t(`settings.models.thinkingEfforts.${selectedThinkingEffort}`)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className={selectContentClassName}>
              <SelectGroup>
                {supportedThinkingEfforts.map((effort) => (
                  <SelectItem key={effort} value={effort}>
                    {t(`settings.models.thinkingEfforts.${effort}`)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      ) : null}
      {isChatGpt ? null : (
        <Field id="provider-api-key" className="col-span-2" label="API Key">
          <SecretInput
            id="provider-api-key"
            key={storedKeyProviderId || 'new'}
            hasStoredValue={Boolean(draft.hasApiKey)}
            value={draft.apiKey || ''}
            onChange={(apiKey) => onChange({ ...draft, apiKey, removeApiKey: false })}
            onRevealStoredValue={() =>
              storedKeyProviderId
                ? getDesktopApi().provider.readApiKey(storedKeyProviderId)
                : Promise.resolve('')
            }
            onRemove={() =>
              onChange({
                ...draft,
                apiKey: '',
                cloneApiKeyFromProviderId: undefined,
                hasApiKey: false,
                removeApiKey: true,
              })
            }
          />
        </Field>
      )}
    </div>
  );
}

type ChatGptAuthUiState = {
  busy: 'idle' | 'signing_in' | 'disconnecting';
  error: string;
};

type ChatGptAuthUiEvent =
  | { type: 'signInStarted' }
  | { type: 'disconnectStarted' }
  | { type: 'succeeded' }
  | { type: 'cancelled' }
  | { type: 'failed'; error: string };

const initialChatGptAuthUiState: ChatGptAuthUiState = {
  busy: 'idle',
  error: '',
};

function chatGptAuthUiReducer(
  state: ChatGptAuthUiState,
  event: ChatGptAuthUiEvent,
): ChatGptAuthUiState {
  switch (event.type) {
    case 'signInStarted':
      return { busy: 'signing_in', error: '' };
    case 'disconnectStarted':
      return { busy: 'disconnecting', error: '' };
    case 'succeeded':
    case 'cancelled':
      return { busy: 'idle', error: '' };
    case 'failed':
      return { busy: 'idle', error: event.error };
  }
}

function ChatGptAccountField({
  account,
  onConnected,
  onDisconnected,
}: {
  account: ChatGptAccountState;
  onConnected: (state: ChatGptAccountState) => void;
  onDisconnected: (state: ChatGptAccountState) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(chatGptAuthUiReducer, initialChatGptAuthUiState);
  const signingInRef = useRef(false);
  const mountedRef = useRef(true);

  useMountEffect(() => () => {
    mountedRef.current = false;
    if (signingInRef.current) {
      signingInRef.current = false;
      void getOptionalDesktopApi()?.provider?.cancelChatGptSignIn?.();
    }
  });

  async function signIn() {
    signingInRef.current = true;
    dispatch({ type: 'signInStarted' });
    try {
      const nextState = await getDesktopApi().provider.signInChatGpt();
      signingInRef.current = false;
      if (!mountedRef.current) return;
      dispatch({ type: 'succeeded' });
      onConnected(nextState);
    } catch (error) {
      signingInRef.current = false;
      void queryClient.invalidateQueries({ queryKey: CHATGPT_AUTH_STATUS_QUERY_KEY });
      if (!mountedRef.current) return;
      const message =
        error instanceof Error ? error.message : t('settings.models.chatGptSignInFailed');
      if (message.toLowerCase().includes('cancelled')) {
        dispatch({ type: 'cancelled' });
        return;
      }
      dispatch({ type: 'failed', error: message });
    }
  }

  function cancelSignIn() {
    signingInRef.current = false;
    void getOptionalDesktopApi()?.provider?.cancelChatGptSignIn?.();
    void queryClient.invalidateQueries({ queryKey: CHATGPT_AUTH_STATUS_QUERY_KEY });
    dispatch({ type: 'cancelled' });
  }

  async function disconnect() {
    dispatch({ type: 'disconnectStarted' });
    try {
      const nextState = await getDesktopApi().provider.disconnectChatGpt();
      if (!mountedRef.current) return;
      if (nextState.remoteRevocationFailed) {
        dispatch({ type: 'failed', error: t('settings.models.chatGptRemoteRevocationNotice') });
      } else {
        dispatch({ type: 'succeeded' });
      }
      onDisconnected(nextState);
    } catch (error) {
      void queryClient.invalidateQueries({ queryKey: CHATGPT_AUTH_STATUS_QUERY_KEY });
      if (!mountedRef.current) return;
      dispatch({
        type: 'failed',
        error:
          error instanceof Error ? error.message : t('settings.models.chatGptDisconnectFailed'),
      });
    }
  }

  const connected = account.status === 'connected';
  const reauthRequired = account.status === 'reauth_required';
  const accountLabel = account.email || account.name || t('settings.models.chatGptConnected');

  return (
    <div className="chatgpt-auth-field">
      <div className="chatgpt-auth-card">
        <div className="chatgpt-auth-copy">
          <div className="chatgpt-auth-title-row">
            <span
              className={
                connected
                  ? 'chatgpt-auth-badge is-connected'
                  : reauthRequired
                    ? 'chatgpt-auth-badge is-reauth'
                    : 'chatgpt-auth-badge'
              }
            >
              {connected ? <HugeiconsIcon icon={Tick01Icon} size={12} /> : null}
              {connected
                ? t('settings.models.chatGptStatusConnected')
                : reauthRequired
                  ? t('settings.models.chatGptStatusReauth')
                  : t('settings.models.chatGptStatusDisconnected')}
            </span>
            {connected ? <strong className="chatgpt-auth-identity">{accountLabel}</strong> : null}
          </div>
          <p className="chatgpt-auth-note">
            {state.busy === 'signing_in'
              ? t('settings.models.chatGptWaitingBrowser')
              : connected
                ? t('settings.models.chatGptSharedAccountHint')
                : reauthRequired
                  ? t('settings.models.chatGptReauthHint')
                  : t('settings.models.chatGptSignInHint')}
          </p>
        </div>
        <div className="chatgpt-auth-actions">
          {state.busy === 'signing_in' ? (
            <Button type="button" variant="secondary" onClick={cancelSignIn}>
              {t('settings.models.cancel')}
            </Button>
          ) : connected ? (
            <Button
              type="button"
              variant="secondary"
              disabled={state.busy === 'disconnecting'}
              onClick={disconnect}
            >
              <HugeiconsIcon icon={Logout01Icon} size={14} />
              {t('settings.models.chatGptDisconnect')}
            </Button>
          ) : (
            <>
              <Button type="button" disabled={state.busy === 'disconnecting'} onClick={signIn}>
                {reauthRequired
                  ? t('settings.models.chatGptReconnect')
                  : t('settings.models.chatGptSignIn')}
              </Button>
              {reauthRequired || account.hasSavedRegistration ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={state.busy === 'disconnecting'}
                  onClick={disconnect}
                >
                  <HugeiconsIcon icon={Logout01Icon} size={14} />
                  {t('settings.models.chatGptDisconnect')}
                </Button>
              ) : null}
            </>
          )}
        </div>
      </div>
      {state.error ? (
        <p className="settings-inline-error" role="alert">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}

type SecretInputState = {
  revealError: string;
  revealLoading: boolean;
  revealedStoredValue: string;
  visible: boolean;
};

type SecretInputEvent =
  | { type: 'edited' }
  | { type: 'hidden' }
  | { type: 'revealFailed'; error: string }
  | { type: 'revealStarted' }
  | { type: 'revealSucceeded'; error: string; value: string }
  | { type: 'shown' }
  | { type: 'storedValueRemoved' };

const initialSecretInputState: SecretInputState = {
  revealError: '',
  revealLoading: false,
  revealedStoredValue: '',
  visible: false,
};

function secretInputReducer(state: SecretInputState, event: SecretInputEvent): SecretInputState {
  switch (event.type) {
    case 'edited':
      return { ...state, revealError: '', revealLoading: false, revealedStoredValue: '' };
    case 'hidden':
      return { ...state, revealError: '', revealedStoredValue: '', visible: false };
    case 'revealFailed':
      return { ...state, revealError: event.error, revealLoading: false };
    case 'revealStarted':
      return { ...state, revealError: '', revealLoading: true };
    case 'revealSucceeded':
      return {
        revealError: event.error,
        revealLoading: false,
        revealedStoredValue: event.value,
        visible: true,
      };
    case 'shown':
      return { ...state, visible: true };
    case 'storedValueRemoved':
      return initialSecretInputState;
  }
}

function SecretInput({
  hasStoredValue,
  id,
  value,
  onChange,
  onRevealStoredValue,
  onRemove,
}: {
  hasStoredValue?: boolean;
  id: string;
  value: string;
  onChange: (value: string) => void;
  onRevealStoredValue?: () => Promise<string>;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const [{ revealError, revealLoading, revealedStoredValue, visible }, dispatch] = useReducer(
    secretInputReducer,
    initialSecretInputState,
  );
  const revealRequestRef = useRef(0);
  const displayValue = value || (visible ? revealedStoredValue : '');

  async function toggleVisible() {
    if (visible) {
      dispatch({ type: 'hidden' });
      return;
    }

    if (value || !hasStoredValue) {
      dispatch({ type: 'shown' });
      return;
    }

    dispatch({ type: 'revealStarted' });
    const requestId = ++revealRequestRef.current;
    try {
      const storedValue = (await onRevealStoredValue?.()) || '';
      if (requestId !== revealRequestRef.current) return;
      dispatch({
        type: 'revealSucceeded',
        error: storedValue ? '' : t('settings.models.noStoredKey'),
        value: storedValue,
      });
    } catch {
      if (requestId !== revealRequestRef.current) return;
      dispatch({ type: 'revealFailed', error: t('settings.models.readStoredKeyFailed') });
    }
  }

  function edit(nextValue: string) {
    revealRequestRef.current += 1;
    dispatch({ type: 'edited' });
    onChange(nextValue);
  }

  function removeStoredValue() {
    revealRequestRef.current += 1;
    dispatch({ type: 'storedValueRemoved' });
    onRemove();
  }

  return (
    <div className="secret-input">
      <div className="relative">
        <Input
          id={id}
          className="pr-12"
          name={id}
          autoComplete="off"
          placeholder={hasStoredValue ? t('settings.models.apiKeyStoredPlaceholder') : undefined}
          spellCheck={false}
          type={visible ? 'text' : 'password'}
          value={displayValue}
          onChange={(event) => edit(event.target.value)}
        />
        <button
          className="secret-toggle"
          type="button"
          disabled={revealLoading}
          aria-label={visible ? t('settings.models.hideApiKey') : t('settings.models.showApiKey')}
          onClick={toggleVisible}
        >
          {visible ? (
            <HugeiconsIcon icon={ViewOffIcon} size={17} />
          ) : (
            <HugeiconsIcon icon={ViewIcon} size={17} />
          )}
        </button>
      </div>
      {revealError ? <p className="secret-input-error">{revealError}</p> : null}
      {hasStoredValue && !value ? (
        <Button
          className="secret-remove"
          type="button"
          variant="secondary"
          onClick={removeStoredValue}
        >
          <HugeiconsIcon icon={Delete02Icon} size={14} />
          {t('settings.models.removeStoredKey')}
        </Button>
      ) : null}
    </div>
  );
}
