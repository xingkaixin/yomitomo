import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Collection } from '@yomitomo/shared';
import { SegmentedControl } from '../components/ui/segmented-control';
import { DistillationLibrary } from '../distillations/app-distillation-library';
import type { ReadingEvidenceSourceTarget } from '../shell/app-reading-types';
import { ReadingLibraryQuestion } from './reading-library-question';
import './app-reading-memory.css';

type ReadingMemoryTab = 'distillations' | 'library' | 'review';

export function ReadingMemory({
  collections,
  catalogRevision,
  onOpenEvidenceSource,
}: {
  collections: Collection[];
  catalogRevision: unknown;
  onOpenEvidenceSource: (target: ReadingEvidenceSourceTarget) => void;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<ReadingMemoryTab>('distillations');

  return (
    <section className="reading-memory" aria-label={t('readingMemory.title')}>
      <header className="reading-memory-navigation">
        <span>{t('readingMemory.title')}</span>
        <SegmentedControl
          role="tablist"
          aria-label={t('readingMemory.tabs.label')}
          value={tab}
          onValueChange={setTab}
          options={[
            { value: 'distillations', label: t('readingMemory.tabs.distillations') },
            { value: 'library', label: t('readingMemory.tabs.library') },
            { value: 'review', label: t('readingMemory.tabs.review'), disabled: true },
          ]}
        />
      </header>
      <div
        className="reading-memory-content"
        role="tabpanel"
        aria-label={t(`readingMemory.tabs.${tab}`)}
      >
        {tab === 'distillations' ? (
          <DistillationLibrary onOpenEvidenceSource={onOpenEvidenceSource} />
        ) : null}
        {tab === 'library' ? (
          <ReadingLibraryQuestion
            collections={collections}
            catalogRevision={catalogRevision}
            onOpenEvidenceSource={onOpenEvidenceSource}
          />
        ) : null}
      </div>
    </section>
  );
}
