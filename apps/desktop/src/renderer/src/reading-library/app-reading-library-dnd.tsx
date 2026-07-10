import { useState, type ReactNode } from 'react';
import { Accessibility, PointerActivationConstraints, PointerSensor } from '@dnd-kit/dom';
import {
  DragDropProvider,
  DragOverlay,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  useDraggable,
  useDroppable,
} from '@dnd-kit/react';
import type { ContentRef } from '@yomitomo/shared';
import { GripVertical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { contentRefKey } from './app-reading-library-entities';

const LIBRARY_CONTENT_DRAG_TYPE = 'library-content';

type LibraryDragData = {
  kind: typeof LIBRARY_CONTENT_DRAG_TYPE;
  ref: ContentRef;
  title: string;
};

type LibraryDropData = {
  kind: 'library-drop-target';
  label: string;
  onDrop: (ref: ContentRef) => void;
};

export function LibraryDndProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [activeDrag, setActiveDrag] = useState<LibraryDragData | null>(null);

  return (
    <DragDropProvider
      sensors={(defaults) => [
        ...defaults.filter((sensor) => sensor !== PointerSensor),
        PointerSensor.configure({
          activationConstraints: [new PointerActivationConstraints.Distance({ value: 6 })],
        }),
      ]}
      plugins={(defaults) => [
        ...defaults.filter((plugin) => plugin !== Accessibility),
        Accessibility.configure({
          screenReaderInstructions: {
            draggable: t('library.collection.dragInstructions'),
          },
          announcements: {
            dragstart: ({ operation }: DragStartEvent) => {
              const source = libraryDragData(operation.source?.data);
              return source
                ? t('library.collection.dragStarted', { title: source.title })
                : undefined;
            },
            dragover: ({ operation }: DragOverEvent) => {
              const target = libraryDropData(operation.target?.data);
              return target
                ? t('library.collection.draggedOver', { target: target.label })
                : undefined;
            },
            dragend: ({ canceled, operation }: DragEndEvent) => {
              const source = libraryDragData(operation.source?.data);
              const target = libraryDropData(operation.target?.data);
              if (!source) return undefined;
              if (canceled || !target) {
                return t('library.collection.dragCancelled', { title: source.title });
              }
              return t('library.collection.dragCompleted', {
                target: target.label,
                title: source.title,
              });
            },
          },
        }),
      ]}
      onDragStart={({ operation }) => setActiveDrag(libraryDragData(operation.source?.data))}
      onDragEnd={(event) => {
        setActiveDrag(null);
        if (event.canceled) return;
        dispatchLibraryDrop(event.operation.source?.data, event.operation.target?.data);
      }}
    >
      {children}
      <DragOverlay className="library-drag-overlay" dropAnimation={null}>
        {activeDrag ? (
          <span>
            <GripVertical size={15} aria-hidden="true" />
            {activeDrag.title}
          </span>
        ) : null}
      </DragOverlay>
    </DragDropProvider>
  );
}

export function useLibraryDraggable({ ref, title }: { ref: ContentRef; title: string }) {
  return useDraggable<LibraryDragData>({
    id: `picker:${contentRefKey(ref)}`,
    type: LIBRARY_CONTENT_DRAG_TYPE,
    data: { kind: LIBRARY_CONTENT_DRAG_TYPE, ref, title },
  });
}

export function useLibraryDroppable({
  accepts = () => true,
  id,
  label,
  onDrop,
}: {
  accepts?: (ref: ContentRef) => boolean;
  id: string;
  label: string;
  onDrop: (ref: ContentRef) => void;
}) {
  return useDroppable<LibraryDropData>({
    id,
    type: 'library-drop-target',
    accept: (source) => {
      const data = libraryDragData(source.data);
      return Boolean(data && accepts(data.ref));
    },
    data: { kind: 'library-drop-target', label, onDrop },
  });
}

export function dispatchLibraryDrop(source: unknown, target: unknown) {
  const sourceData = libraryDragData(source);
  const targetData = libraryDropData(target);
  if (!sourceData || !targetData) return false;
  targetData.onDrop(sourceData.ref);
  return true;
}

function libraryDragData(value: unknown): LibraryDragData | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Partial<LibraryDragData>;
  if (data.kind !== LIBRARY_CONTENT_DRAG_TYPE || !data.ref || typeof data.title !== 'string') {
    return null;
  }
  return data as LibraryDragData;
}

function libraryDropData(value: unknown): LibraryDropData | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Partial<LibraryDropData>;
  if (
    data.kind !== 'library-drop-target' ||
    typeof data.label !== 'string' ||
    typeof data.onDrop !== 'function'
  ) {
    return null;
  }
  return data as LibraryDropData;
}
