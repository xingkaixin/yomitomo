import { useCallback, useReducer, useRef } from 'react';
import type React from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { VolumeHighIcon, VolumeOffIcon } from '@hugeicons/core-free-icons';
import type {
  AppSettingsPatch,
  DesktopStore,
  ResolvedAppSettings,
  UiLanguage,
} from '@yomitomo/shared';
import { errorMessageOrFallback, normalizeUiLanguage } from '@yomitomo/shared';
import { useTranslation } from 'react-i18next';
import type { AppMenuCommand } from '../../../app-menu-types';
import rabbitPeekUrl from '../assets/onboarding/rabbit-peek.webp';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogPortal } from '../components/ui/dialog';
import { IconButton } from '../components/ui/icon-button';
import { SegmentedControl } from '../components/ui/segmented-control';
import { LibraryLocalImportEntryGrid } from '../reading-library/app-reading-library-import-entries';
import { personalitiesForKind } from '../settings/app-settings';
import { resolveAgentPersonaAssets } from '../settings/agent-persona-assets';
import { type OnboardingShow, startOnboardingShow } from './app-onboarding-show';

type OnboardingState = { busy: boolean; muted: boolean; status: string };

type OnboardingEvent =
  | { type: 'muteToggled' }
  | { type: 'saveFailed'; status: string }
  | { type: 'saveStarted' }
  | { type: 'saveSucceeded' };

function onboardingReducer(state: OnboardingState, event: OnboardingEvent): OnboardingState {
  switch (event.type) {
    case 'muteToggled':
      return { ...state, muted: !state.muted };
    case 'saveFailed':
      return { ...state, busy: false, status: event.status };
    case 'saveStarted':
      return { ...state, busy: true, status: '' };
    case 'saveSucceeded':
      return { ...state, busy: false, status: '' };
  }
}

type OnboardingSoundSettings = Partial<
  Pick<ResolvedAppSettings, 'soundEffectsEnabled' | 'soundEffectsVolume'>
>;

const demoPersonalityId = 'reading-partner';
const brandLetters = Array.from('Yomitomo');
const thoughtTypingMs = 1500;
const replyTypingMs = 1400;

// Each language keeps its own name so readers can find it from any interface language.
const languageOptions: Array<{ label: string; value: UiLanguage }> = [
  { label: '简体中文', value: 'zh-CN' },
  { label: 'English', value: 'en' },
  { label: '日本語', value: 'ja' },
];

export function OnboardingFlow({
  onSaveSettings,
  onStartReading,
  settings,
}: {
  onSaveSettings: (settings: AppSettingsPatch) => Promise<DesktopStore>;
  onStartReading: (command?: AppMenuCommand) => void;
  settings: OnboardingSoundSettings;
}) {
  const { i18n, t } = useTranslation();
  const [{ busy, muted, status }, dispatch] = useReducer(onboardingReducer, {
    busy: false,
    muted: false,
    status: '',
  });
  const language = normalizeUiLanguage(i18n.resolvedLanguage);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const showRef = useRef<OnboardingShow | null>(null);

  // The show runs once per mount: a new callback identity would restart it on every render.
  const attachShow = useCallback((stage: HTMLDivElement) => {
    const show = startOnboardingShow(stage, settings);
    showRef.current = show;
    return () => {
      show.dispose();
      showRef.current = null;
    };
  }, []);

  async function completeOnboarding(command?: AppMenuCommand) {
    dispatch({ type: 'saveStarted' });
    try {
      await onSaveSettings({ onboardingCompletedAt: new Date().toISOString() });
      onStartReading(command);
    } catch (error) {
      dispatch({
        type: 'saveFailed',
        status: errorMessageOrFallback(error, t('onboarding.enterFailed')),
      });
    }
  }

  async function changeLanguage(uiLanguage: UiLanguage) {
    dispatch({ type: 'saveStarted' });
    try {
      await onSaveSettings({ uiLanguage });
      dispatch({ type: 'saveSucceeded' });
    } catch (error) {
      dispatch({
        type: 'saveFailed',
        status: errorMessageOrFallback(error, t('onboarding.languageFailed')),
      });
    }
  }

  function toggleMute() {
    showRef.current?.setMuted(!muted);
    dispatch({ type: 'muteToggled' });
  }

  return (
    <Dialog open modal disablePointerDismissal>
      <DialogPortal>
        <DialogContent
          aria-label={t('onboarding.ariaLabel')}
          className="onboarding-screen"
          initialFocus={titleRef}
          lang={language}
        >
          <div className="onboarding-stage" ref={attachShow}>
            <header className="onboarding-header">
              <p className="onboarding-brand">Yomitomo</p>
              <div className="onboarding-tools">
                <SegmentedControl<UiLanguage>
                  aria-label={t('settings.general.languageTitle')}
                  className="onboarding-language"
                  options={languageOptions.map(({ label, value }) => ({
                    disabled: busy,
                    label,
                    value,
                  }))}
                  value={language}
                  onValueChange={(value) => void changeLanguage(value)}
                />
                {settings.soundEffectsEnabled === false ? null : (
                  <IconButton
                    aria-label={t(muted ? 'onboarding.unmuteMusic' : 'onboarding.muteMusic')}
                    className="onboarding-mute"
                    onClick={toggleMute}
                  >
                    <HugeiconsIcon icon={muted ? VolumeOffIcon : VolumeHighIcon} size={18} />
                  </IconButton>
                )}
              </div>
            </header>
            <div className="onboarding-main">
              <section className="onboarding-start">
                <h1 ref={titleRef} tabIndex={-1}>
                  <span className="onboarding-title-start">{t('onboarding.titleStart')}</span>
                  <span className="onboarding-title-end">{t('onboarding.titleEnd')}</span>
                </h1>
                <p>{t('onboarding.description')}</p>
                <LibraryLocalImportEntryGrid
                  disabled={busy}
                  onAddEbook={() => void completeOnboarding('import-ebook')}
                  onAddPdf={() => void completeOnboarding('import-pdf')}
                  onAddWebArticle={() => void completeOnboarding('import-web')}
                />
                {status ? (
                  <p className="onboarding-status" role="alert">
                    {status}
                  </p>
                ) : null}
                <Button
                  className="onboarding-skip"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void completeOnboarding()}
                >
                  {busy ? t('onboarding.entering') : t('onboarding.enter')}
                </Button>
              </section>
              <OnboardingDemo language={language} />
            </div>
            <div className="onboarding-intro" aria-hidden="true">
              <p className="onboarding-intro-wordmark">
                {brandLetters.map((letter, index) => (
                  <span key={index} style={indexStyle(index)}>
                    {letter}
                  </span>
                ))}
              </p>
              <div className="onboarding-intro-rabbit">
                <img alt="" src={rabbitPeekUrl} />
              </div>
              <div className="onboarding-intro-book">
                <i />
                <i />
                <i />
              </div>
            </div>
            <button
              className="onboarding-show-skip"
              type="button"
              onClick={() => showRef.current?.skip()}
            >
              {t('onboarding.skipShow')}
            </button>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}

function OnboardingDemo({ language }: { language: UiLanguage }) {
  const { t } = useTranslation();
  const assistant = personalitiesForKind('annotation', language).find(
    (personality) => personality.id === demoPersonalityId,
  );

  return (
    <figure className="onboarding-demo">
      <div className="onboarding-demo-sheet" aria-hidden="true">
        <div className="onboarding-demo-peek">
          <img alt="" src={rabbitPeekUrl} />
        </div>
        <div className="onboarding-demo-page">
          <p className="onboarding-demo-passage">
            <span>{t('onboarding.demo.before')}</span>
            <mark>{t('onboarding.demo.highlight')}</mark>
            <span>{t('onboarding.demo.after')}</span>
          </p>
          <div className="onboarding-demo-underline" />
          <div className="onboarding-demo-thread">
            <p className="onboarding-demo-thought">
              <TypedText durationMs={thoughtTypingMs} text={t('onboarding.demo.thought')} />
            </p>
            <div className="onboarding-demo-reply">
              <img alt="" src={resolveAgentPersonaAssets(language, demoPersonalityId)?.avatar} />
              <div>
                <strong>{assistant?.name}</strong>
                <p>
                  <TypedText durationMs={replyTypingMs} text={t('onboarding.demo.reply')} />
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <figcaption>{t('onboarding.aiNote')}</figcaption>
    </figure>
  );
}

function TypedText({ durationMs, text }: { durationMs: number; text: string }) {
  const characters = Array.from(text);
  return (
    <span
      className="onboarding-typed"
      style={
        { '--onboarding-type-step': `${durationMs / characters.length}ms` } as React.CSSProperties
      }
    >
      {characters.map((character, index) => (
        <span key={index} style={indexStyle(index)}>
          {character}
        </span>
      ))}
    </span>
  );
}

function indexStyle(index: number) {
  return { '--onboarding-index': index } as React.CSSProperties;
}
