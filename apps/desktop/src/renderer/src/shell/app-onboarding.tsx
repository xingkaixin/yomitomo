import { useEffect, useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { AppSettings, DesktopStore } from '@yomitomo/shared';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogPortal } from '../components/ui/dialog';
import onboardingBackground from '../assets/onboarding/onboarding-background.webp';

type OnboardingCopyBlock = {
  id: string;
  kind: 'h1' | 'h2' | 'p';
  lines: string[];
  startLine: number;
  endLine: number;
};

const lineRevealDelayMs = 900;
const lineRevealIntervalMs = 260;

const onboardingCopyBlockTemplates: Array<Pick<OnboardingCopyBlock, 'id' | 'kind'>> = [
  { id: 'title', kind: 'h1' },
  { id: 'opening', kind: 'p' },
  { id: 'origin', kind: 'p' },
  { id: 'companion', kind: 'p' },
  { id: 'principle', kind: 'h2' },
  { id: 'memory', kind: 'p' },
  { id: 'closing', kind: 'p' },
];

export function OnboardingFlow({
  store,
  onSaveSettings,
}: {
  store: DesktopStore;
  onSaveSettings: (settings: AppSettings) => Promise<DesktopStore>;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [visibleLineCount, setVisibleLineCount] = useState(0);
  const onboardingCopyBlocks = useMemo(
    () =>
      createCopyBlocks(
        onboardingCopyBlockTemplates.map((block) => ({
          id: block.id,
          kind: block.kind,
          lines: t(`onboarding.blocks.${block.id}.lines`, { returnObjects: true }) as string[],
        })),
      ),
    [t],
  );
  const onboardingLineCount = onboardingCopyBlocks.at(-1)?.endLine ?? 0;
  const copyComplete = visibleLineCount >= onboardingLineCount;

  useEffect(() => {
    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reducedMotion) {
      setVisibleLineCount(onboardingLineCount);
      return;
    }

    let intervalId: number | undefined;
    const delayId = window.setTimeout(() => {
      setVisibleLineCount(1);
      intervalId = window.setInterval(() => {
        setVisibleLineCount((count) => {
          const nextCount = Math.min(count + 1, onboardingLineCount);
          if (nextCount >= onboardingLineCount && intervalId) {
            window.clearInterval(intervalId);
          }
          return nextCount;
        });
      }, lineRevealIntervalMs);
    }, lineRevealDelayMs);

    return () => {
      window.clearTimeout(delayId);
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [onboardingLineCount]);

  async function completeOnboarding() {
    setBusy(true);
    setStatus('');
    try {
      await onSaveSettings({
        ...store.settings,
        onboardingCompletedAt: new Date().toISOString(),
      });
    } catch (error) {
      setStatus(errorMessage(error, t('onboarding.enterFailed')));
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
              {onboardingCopyBlocks.map((block) => (
                <OnboardingCopyLine
                  block={block}
                  key={block.id}
                  visibleLineCount={visibleLineCount}
                />
              ))}
            </div>
            {status ? <p className="onboarding-status">{status}</p> : null}
            {copyComplete ? (
              <Button
                className="onboarding-enter-button"
                disabled={busy}
                type="button"
                onClick={completeOnboarding}
              >
                {busy ? t('onboarding.entering') : t('onboarding.enter')}
                <ArrowRight size={18} />
              </Button>
            ) : null}
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}

function OnboardingCopyLine({
  block,
  visibleLineCount,
}: {
  block: OnboardingCopyBlock;
  visibleLineCount: number;
}) {
  const children = block.lines.map((line, index) => (
    <span
      className={
        block.startLine + index < visibleLineCount
          ? 'onboarding-line is-visible'
          : 'onboarding-line'
      }
      key={`${block.id}-${index}`}
    >
      {line}
    </span>
  ));

  const className =
    block.endLine <= visibleLineCount
      ? 'onboarding-copy-block is-visible'
      : 'onboarding-copy-block';

  if (block.kind === 'h1') {
    return (
      <h1 className={className} id="onboarding-title">
        {children}
      </h1>
    );
  }

  if (block.kind === 'h2') {
    return <h2 className={className}>{children}</h2>;
  }

  return <p className={className}>{children}</p>;
}

function createCopyBlocks(
  blocks: Array<Pick<OnboardingCopyBlock, 'id' | 'kind' | 'lines'>>,
): OnboardingCopyBlock[] {
  let cursor = 0;
  return blocks.map((block) => {
    const startLine = cursor;
    const endLine = startLine + block.lines.length;
    cursor = endLine;
    return {
      ...block,
      startLine,
      endLine,
    };
  });
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
