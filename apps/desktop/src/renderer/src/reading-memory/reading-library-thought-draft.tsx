import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReadingEvidence, ReadingJudgmentClaim } from '@yomitomo/shared';
import { Button } from '../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from '../components/ui/dialog';
import { getDesktopApi } from '../shell/app-desktop-api';

export function ReadingLibraryThoughtDraft({
  claim,
  evidence,
  onClose,
}: {
  claim: ReadingJudgmentClaim;
  evidence: ReadingEvidence[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'opening' | 'failed'>('idle');
  const titleRef = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(true);
  const citations = claim.evidenceIds.flatMap((id) => {
    const item = evidence.find((entry) => entry.id === id);
    return item ? [item] : [];
  });
  const valid =
    claim.text.trim().length > 0 &&
    citations.length > 0 &&
    citations.length === claim.evidenceIds.length &&
    new Set(claim.evidenceIds).size === claim.evidenceIds.length;
  const selected = valid ? citations.find((item) => item.id === selectedId) : undefined;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function openDraft() {
    if (!selected || phase === 'opening') return;
    setPhase('opening');
    try {
      await getDesktopApi().annotations.discussion.open({
        articleId: selected.source.ref.id,
        annotationId: selected.location.annotationId,
        thoughtDraft: claim.text,
      });
      if (mounted.current) onClose();
    } catch {
      if (mounted.current) setPhase('failed');
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogPortal>
        <DialogOverlay className="reading-library-thought-overlay">
          <DialogContent className="reading-library-thought-dialog" initialFocus={titleRef}>
            <header>
              <DialogTitle ref={titleRef} tabIndex={-1}>
                {t('readingMemory.library.thought.title')}
              </DialogTitle>
              <DialogDescription>
                {t('readingMemory.library.thought.description')}
              </DialogDescription>
            </header>
            <blockquote className="reading-library-thought-text">{claim.text}</blockquote>
            {valid ? (
              <fieldset
                className="reading-library-thought-citations"
                disabled={phase === 'opening'}
              >
                <legend>{t('readingMemory.library.thought.citations')}</legend>
                {citations.map((item) => (
                  <label className="reading-library-thought-citation" key={item.id}>
                    <input
                      type="radio"
                      name="reading-library-thought-citation"
                      value={item.id}
                      checked={selectedId === item.id}
                      onChange={() => setSelectedId(item.id)}
                    />
                    <span>
                      <strong>{item.source.title}</strong>
                      <span>{item.content}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            ) : (
              <p role="alert">{t('readingMemory.library.thought.invalidEvidence')}</p>
            )}
            {phase === 'failed' ? (
              <p role="alert">{t('readingMemory.library.thought.openFailed')}</p>
            ) : null}
            {phase === 'opening' ? (
              <p role="status">{t('readingMemory.library.thought.opening')}</p>
            ) : null}
            <footer className="reading-library-actions">
              <Button variant="secondary" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button disabled={!selected || phase === 'opening'} onClick={() => void openDraft()}>
                {t('readingMemory.library.thought.openDraft')}
              </Button>
            </footer>
          </DialogContent>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  );
}
