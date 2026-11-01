import { useReducer, useRef } from 'react';
import type { AppSettingsPatch, DesktopStore, UiLanguage } from '@yomitomo/shared';
import { errorMessageOrFallback, normalizeUiLanguage } from '@yomitomo/shared';
import { useTranslation } from 'react-i18next';
import type { AppMenuCommand } from '../../../app-menu-types';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogPortal } from '../components/ui/dialog';
import { SegmentedControl } from '../components/ui/segmented-control';
import { LibraryLocalImportEntryGrid } from '../reading-library/app-reading-library-import-entries';
import { personalitiesForKind } from '../settings/app-settings';
import { resolveAgentPersonaAssets } from '../settings/agent-persona-assets';

type OnboardingState = { busy: boolean; status: string };

type OnboardingEvent =
  | { type: 'saveFailed'; status: string }
  | { type: 'saveStarted' }
  | { type: 'saveSucceeded' };

function onboardingReducer(_state: OnboardingState, event: OnboardingEvent): OnboardingState {
  switch (event.type) {
    case 'saveFailed':
      return { busy: false, status: event.status };
    case 'saveStarted':
      return { busy: true, status: '' };
    case 'saveSucceeded':
      return { busy: false, status: '' };
  }
}

const demoPersonalityId = 'reading-partner';

// Each language keeps its own name so readers can find it from any interface language.
const languageOptions: Array<{ label: string; value: UiLanguage }> = [
  { label: '简体中文', value: 'zh-CN' },
  { label: 'English', value: 'en' },
  { label: '日本語', value: 'ja' },
];

export function OnboardingFlow({
  onSaveSettings,
  onStartReading,
}: {
  onSaveSettings: (settings: AppSettingsPatch) => Promise<DesktopStore>;
  onStartReading: (command?: AppMenuCommand) => void;
}) {
  const { i18n, t } = useTranslation();
  const [{ busy, status }, dispatch] = useReducer(onboardingReducer, { busy: false, status: '' });
  const language = normalizeUiLanguage(i18n.resolvedLanguage);
  const titleRef = useRef<HTMLHeadingElement>(null);

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

  return (
    <Dialog open modal disablePointerDismissal>
      <DialogPortal>
        <DialogContent
          aria-label={t('onboarding.ariaLabel')}
          className="onboarding-screen"
          initialFocus={titleRef}
          lang={language}
        >
          <header className="onboarding-header">
            <p className="onboarding-brand">Yomitomo</p>
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
          </header>
          <div className="onboarding-main">
            <section className="onboarding-start">
              <h1 ref={titleRef} tabIndex={-1}>
                {t('onboarding.title')}
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
      <div className="onboarding-demo-page" aria-hidden="true">
        <p>
          {t('onboarding.demo.before')}
          <mark>{t('onboarding.demo.highlight')}</mark>
          {t('onboarding.demo.after')}
        </p>
        <div className="onboarding-demo-thread">
          <p>{t('onboarding.demo.thought')}</p>
          <div className="onboarding-demo-reply">
            <img alt="" src={resolveAgentPersonaAssets(language, demoPersonalityId)?.avatar} />
            <div>
              <strong>{assistant?.name}</strong>
              <p>{t('onboarding.demo.reply')}</p>
            </div>
          </div>
        </div>
      </div>
      <figcaption>{t('onboarding.aiNote')}</figcaption>
    </figure>
  );
}
