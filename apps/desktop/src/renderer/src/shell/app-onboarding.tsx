import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { AppSettings, DesktopStore } from '@yomitomo/shared';
import { Button } from '../components/ui/button';
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

const onboardingCopyBlocks = createCopyBlocks([
  {
    id: 'title',
    kind: 'h1',
    lines: ['你有多久，没有真正', '读完一篇文章了？'],
  },
  {
    id: 'opening',
    kind: 'p',
    lines: [
      '不是扫一眼标题、收藏、再也没打开。',
      '是真的读完。读到中间会停下来想一想，',
      '读到某句话会画一道线，读完之后，能跟谁聊一聊。',
    ],
  },
  {
    id: 'origin',
    kind: 'p',
    lines: ['我们做了 Yomitomo，因为我们也想念那种感觉。'],
  },
  {
    id: 'companion',
    kind: 'p',
    lines: [
      '它是一个 AI 伴读。你读文章的时候，它也在读。',
      '你画的高亮，它会回应。',
      '它画的高亮，你可以追问。',
      '你写下一句感受，它接一句它的看法。',
      '就像两个人捧着同一本书，时不时抬头看看对方。',
    ],
  },
  {
    id: 'principle',
    kind: 'h2',
    lines: ['伴读不是替你读。'],
  },
  {
    id: 'memory',
    kind: 'p',
    lines: [
      '我们不会替你总结一篇文章——那只是把"没读"包装得更体面。',
      '我们想做的是，在你读的时候，陪你想得更深一点。',
      '读完之后，那些批注、那些来回的对话、',
      '那些当时灵光一闪的想法，都留下来。',
      '明天、下个月、甚至几年后，你打开同一篇文章，',
      '会发现你和它一起读过。',
    ],
  },
  {
    id: 'closing',
    kind: 'p',
    lines: ['这是 Yomitomo，伴读。', '你专注地读，它认真地陪。'],
  },
]);

const onboardingLineCount = onboardingCopyBlocks.at(-1)?.endLine ?? 0;

export function OnboardingFlow({
  store,
  onSaveSettings,
}: {
  store: DesktopStore;
  onSaveSettings: (settings: AppSettings) => Promise<DesktopStore>;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [visibleLineCount, setVisibleLineCount] = useState(0);
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
  }, []);

  async function completeOnboarding() {
    setBusy(true);
    setStatus('');
    try {
      await onSaveSettings({
        ...store.settings,
        onboardingCompletedAt: new Date().toISOString(),
      });
    } catch (error) {
      setStatus(errorMessage(error, '进入应用失败。'));
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="你有多久，没有真正读完一篇文章了？"
      aria-modal="true"
      className="onboarding-screen"
      role="dialog"
    >
      <img alt="" className="onboarding-background" src={onboardingBackground} />
      <div className="onboarding-copy">
        <div className="onboarding-scroll">
          {onboardingCopyBlocks.map((block) => (
            <OnboardingCopyLine block={block} key={block.id} visibleLineCount={visibleLineCount} />
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
            {busy ? '正在进入' : '进入 Yomitomo'}
            <ArrowRight size={18} />
          </Button>
        ) : null}
      </div>
    </section>
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
