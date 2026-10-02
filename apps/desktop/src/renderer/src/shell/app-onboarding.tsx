import { useState } from 'react';
import type { AppSettingsPatch, DesktopStore } from '@yomitomo/shared';
import { errorMessageOrFallback } from '@yomitomo/shared';
import { useTranslation } from 'react-i18next';
import type { AppMenuCommand } from '../../../app-menu-types';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogPortal } from '../components/ui/dialog';
import onboardingBackground from '../assets/onboarding/onboarding-background.webp';

export function OnboardingFlow({
  onSaveSettings,
  onStartReading,
}: {
  onSaveSettings: (settings: AppSettingsPatch) => Promise<DesktopStore>;
  onStartReading: (command?: AppMenuCommand) => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  async function completeOnboarding(command?: AppMenuCommand) {
    setBusy(true);
    setStatus('');
    try {
      await onSaveSettings({ onboardingCompletedAt: new Date().toISOString() });
      onStartReading(command);
    } catch (error) {
      setStatus(errorMessageOrFallback(error, t('onboarding.enterFailed')));
      setBusy(false);
    }
  }

  return (
    <Dialog open modal disablePointerDismissal>
      <DialogPortal>
        <DialogContent className="onboarding-screen" aria-label={t('onboarding.ariaLabel')}>
          <img alt="" className="onboarding-background" src={onboardingBackground} />
          <div className="onboarding-copy">
            <div className="onboarding-scroll">
              <p className="onboarding-brand">Yomitomo</p>
              <h1>{t('onboarding.title')}</h1>
              <p>{t('onboarding.description')}</p>
              <ol className="onboarding-steps">
                {(['import', 'read', 'save'] as const).map((step) => (
                  <li key={step}>
                    <h2>{t(`onboarding.steps.${step}.title`)}</h2>
                    <p>{t(`onboarding.steps.${step}.description`)}</p>
                  </li>
                ))}
              </ol>
              <p>{t('onboarding.localReading')}</p>
            </div>
            {status ? (
              <p className="onboarding-status" role="alert">
                {status}
              </p>
            ) : null}
            <div className="onboarding-actions">
              <Button disabled={busy} onClick={() => void completeOnboarding('import-ebook')}>
                {t('onboarding.importEbook')}
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void completeOnboarding('import-pdf')}
              >
                {t('onboarding.importPdf')}
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void completeOnboarding('import-web')}
              >
                {t('onboarding.importWeb')}
              </Button>
            </div>
            <Button
              className="onboarding-skip"
              variant="ghost"
              disabled={busy}
              onClick={() => void completeOnboarding()}
            >
              {busy ? t('onboarding.entering') : t('onboarding.enter')}
            </Button>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
