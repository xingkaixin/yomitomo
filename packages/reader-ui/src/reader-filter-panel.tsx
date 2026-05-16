import type React from 'react';
import type {
  AnnotationFilterFacets,
  AnnotationFilterGroup,
  AnnotationFilterOption,
} from './reader-utils';
import { AnnotationTypeIcon, AvatarBadge, ReadingIntentIcon } from './reader-component-primitives';

export function AnnotationFilterPanel({
  facets,
  panelProps,
  onClear,
  onToggle,
}: {
  facets: AnnotationFilterFacets;
  panelProps?: React.HTMLAttributes<HTMLDivElement>;
  onClear: () => void;
  onToggle: (group: AnnotationFilterGroup, value: string) => void;
}) {
  const className = ['reader-filter-panel', 't-dropdown', 'is-open', panelProps?.className]
    .filter(Boolean)
    .join(' ');

  return (
    <div {...panelProps} className={className} data-origin="top-right">
      <header>
        <div>
          <strong>过滤筛选</strong>
          <span>{facets.activeCount > 0 ? `${facets.activeCount} 个条件` : '全部批注'}</span>
        </div>
      </header>
      <AnnotationFilterSection title="人物">
        {facets.people.map((option) => (
          <FilterChip
            group="person"
            key={option.id}
            option={option}
            onToggle={onToggle}
            leading={
              <AvatarBadge avatar={option.avatar} fallback={option.fallback || option.label} />
            }
          />
        ))}
      </AnnotationFilterSection>
      <AnnotationFilterSection title="类型">
        {facets.types.map((option) => (
          <FilterChip
            group="type"
            key={option.id}
            option={option}
            onToggle={onToggle}
            leading={<AnnotationTypeIcon type={option.id} />}
          />
        ))}
      </AnnotationFilterSection>
      <AnnotationFilterSection title="动作">
        {facets.actions.map((option) => (
          <FilterChip
            group="action"
            key={option.id}
            option={option}
            onToggle={onToggle}
            leading={<ReadingIntentIcon intent={option.id} />}
          />
        ))}
      </AnnotationFilterSection>
      <footer>
        <button type="button" disabled={facets.activeCount === 0} onClick={onClear}>
          清除过滤
        </button>
        <span>{facets.resultCount} 条结果</span>
      </footer>
    </div>
  );
}

function AnnotationFilterSection({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="reader-filter-group">
      <h3>{title}</h3>
      <div className="reader-filter-chip-grid">{children}</div>
    </section>
  );
}

function FilterChip({
  group,
  leading,
  option,
  onToggle,
}: {
  group: AnnotationFilterGroup;
  leading: React.ReactNode;
  option: AnnotationFilterOption;
  onToggle: (group: AnnotationFilterGroup, value: string) => void;
}) {
  return (
    <button
      className={option.selected ? 'reader-filter-chip is-selected' : 'reader-filter-chip'}
      type="button"
      disabled={option.disabled}
      aria-pressed={option.selected}
      onClick={() => onToggle(group, option.id)}
    >
      <span className="reader-filter-chip-main">
        <span className="reader-filter-chip-leading">{leading}</span>
        <span className="reader-filter-chip-label">{option.label}</span>
      </span>
      <b>{option.count}</b>
    </button>
  );
}
