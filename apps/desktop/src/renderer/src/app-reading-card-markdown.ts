import type React from 'react';
import type {
  AnnotationType,
  ReadingCardSection as PersistedReadingCardSection,
  UserProfile,
} from '@yomitomo/shared';
import { renderMarkdown } from '@yomitomo/shared';
import type { ReadingCardEvidenceUnit } from '@yomitomo/core';
import { formatDateTime } from './app-utils';

const annotationTypeIconHtml: Record<AnnotationType, string> = {
  key_point: lucideIconHtml(
    '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  ),
  assumption: lucideIconHtml(
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  ),
  concept: lucideIconHtml(
    '<path d="M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z"/>',
  ),
  question: lucideIconHtml(
    '<path d="M14 9.536V7a4 4 0 0 1 4-4h1.5a.5.5 0 0 1 .5.5V5a4 4 0 0 1-4 4 4 4 0 0 0-4 4c0 2 1 3 1 5a5 5 0 0 1-1 3"/><path d="M4 9a5 5 0 0 1 8 4 5 5 0 0 1-8-4"/><path d="M5 21h14"/>',
  ),
  quote: lucideIconHtml(
    '<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/>',
  ),
};

function lucideIconHtml(content: string) {
  return `<svg class="reading-card-evidence-chip-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${content}</svg>`;
}

export function parseReadingCardMarkdownSections(markdown: string): PersistedReadingCardSection[] {
  const sections: PersistedReadingCardSection[] = [];
  let current: PersistedReadingCardSection | null = null;
  for (const line of markdown.split('\n')) {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      if (current) sections.push(current);
      current = { title: heading[1].trim(), content: '' };
      continue;
    }
    if (!current) continue;
    current.content = `${current.content}${current.content ? '\n' : ''}${line}`.trim();
  }
  if (current) sections.push(current);
  return sections;
}

export function splitReadingCardSection(content: string) {
  const blocks: Array<{ title?: string; content: string }> = [];
  let current: { title?: string; content: string } | null = null;

  for (const line of content.split('\n')) {
    const heading = line.match(/^###\s+(.+)$/);
    if (heading) {
      if (current) blocks.push(current);
      current = { title: heading[1].trim(), content: '' };
      continue;
    }
    if (!current) current = { content: '' };
    current.content = `${current.content}${current.content ? '\n' : ''}${line}`.trim();
  }

  if (current && (current.title || current.content)) blocks.push(current);
  return blocks.length > 0 ? blocks : [{ content: '暂无' }];
}

export function renderReadingCardMarkdown(
  content: string,
  evidenceByIndex: Map<number, ReadingCardEvidenceUnit>,
  userProfile?: Pick<UserProfile, 'avatar' | 'nickname' | 'username'>,
) {
  return replaceReadingCardEvidenceReferences(
    renderMarkdown(content),
    evidenceByIndex,
    userProfile,
  );
}

export function renderReadingCardInlineMarkdown(
  content: string,
  evidenceByIndex: Map<number, ReadingCardEvidenceUnit>,
  userProfile?: Pick<UserProfile, 'avatar' | 'nickname' | 'username'>,
) {
  const html = renderReadingCardMarkdown(content, evidenceByIndex, userProfile);
  const paragraph = html.match(/^<p>([\s\S]*)<\/p>$/);
  return paragraph ? paragraph[1] : html;
}

function replaceReadingCardEvidenceReferences(
  html: string,
  evidenceByIndex: Map<number, ReadingCardEvidenceUnit>,
  userProfile?: Pick<UserProfile, 'avatar' | 'nickname' | 'username'>,
) {
  return html
    .split(/(<[^>]+>)/g)
    .map((part) =>
      part.startsWith('<')
        ? part
        : renderReadingCardEvidenceReferences(part, evidenceByIndex, userProfile),
    )
    .join('');
}

function renderReadingCardEvidenceReferences(
  text: string,
  evidenceByIndex: Map<number, ReadingCardEvidenceUnit>,
  userProfile?: Pick<UserProfile, 'avatar' | 'nickname' | 'username'>,
) {
  return text.replace(/\[#(\d+)\]|#(\d+)/g, (match, bracketValue: string, plainValue: string) => {
    const index = Number(bracketValue || plainValue);
    const unit = evidenceByIndex.get(index);
    return unit ? renderReadingCardEvidenceReference(unit, userProfile) : match;
  });
}

export function renderReadingCardEvidenceReferenceList(
  evidenceIds: number[],
  evidenceByIndex: Map<number, ReadingCardEvidenceUnit>,
) {
  return evidenceIds
    .map((id) => {
      const unit = evidenceByIndex.get(id);
      return unit ? renderReadingCardEvidenceReference(unit) : `#${id}`;
    })
    .join(' ');
}

function renderReadingCardEvidenceReference(
  unit: ReadingCardEvidenceUnit,
  userProfile?: Pick<UserProfile, 'avatar' | 'nickname' | 'username'>,
) {
  const index = unit.index;
  const typeMeta = unit.annotationType
    ? `<span class="reading-card-ref-meta-type">${renderAnnotationTypeIconHtml(unit.annotationTypeKey)}${escapeHtml(unit.annotationType)}</span>`
    : '';
  const intentMeta = unit.readingIntent
    ? `<span class="reading-card-ref-meta-type">${escapeHtml(unit.readingIntent)}</span>`
    : '';
  const chips = [typeMeta, intentMeta].filter(Boolean).join('');
  const authorLabel = readingCardReferenceAuthorLabel(unit, userProfile);
  return `<button class="reading-card-ref" type="button" data-reading-card-evidence-index="${index}" aria-label="打开批注 #${index}">
      <span class="reading-card-ref-label">#${index}</span>
      <span class="reading-card-ref-popover" role="tooltip">
        <span class="reading-card-ref-popover-head">
          <strong>批注 #${index}</strong>
          ${chips ? `<span class="reading-card-ref-chip-row">${chips}</span>` : ''}
        </span>
        <span class="reading-card-ref-author-row">
          ${renderReadingCardReferenceAvatar(unit, userProfile)}
          <span>
            <b>${escapeHtml(authorLabel)}</b>
            <time>${escapeHtml(formatDateTime(unit.createdAt))}</time>
          </span>
        </span>
        <q class="reading-card-ref-quote">${escapeHtml(unit.quote)}</q>
        ${
          unit.annotationBody
            ? `<span class="reading-card-ref-body"><b>批注</b><span>${escapeHtml(unit.annotationBody.content)}</span></span>`
            : ''
        }
      </span>
    </button>`;
}

function readingCardReferenceAuthorLabel(
  unit: ReadingCardEvidenceUnit,
  userProfile?: Pick<UserProfile, 'avatar' | 'nickname' | 'username'>,
) {
  if (unit.annotationAuthor !== 'user') return unit.annotationAuthorLabel;
  return userProfile?.nickname || userProfile?.username || unit.annotationAuthorLabel;
}

function renderReadingCardReferenceAvatar(
  unit: ReadingCardEvidenceUnit,
  userProfile?: Pick<UserProfile, 'avatar' | 'nickname' | 'username'>,
) {
  const avatar =
    unit.annotationAuthor === 'user' && userProfile?.avatar
      ? userProfile.avatar
      : unit.annotationAuthorAvatar;
  if (avatar.trim()) {
    return `<img class="reading-card-ref-avatar" src="${escapeHtml(avatar.trim())}" alt="" />`;
  }
  const fallback = readingCardReferenceAuthorLabel(unit, userProfile).slice(0, 1) || '我';
  return `<span class="reading-card-ref-avatar is-fallback" aria-hidden="true">${escapeHtml(fallback)}</span>`;
}

function renderAnnotationTypeIconHtml(type: AnnotationType | undefined) {
  if (!type) return '';
  return annotationTypeIconHtml[type];
}

export function openReadingCardEvidence(
  event: React.MouseEvent<HTMLElement>,
  evidenceByIndex: Map<number, ReadingCardEvidenceUnit>,
  onOpenEvidence: (annotationId: string) => void,
) {
  const target = event.target instanceof Element ? event.target : null;
  const button = target?.closest<HTMLButtonElement>('[data-reading-card-evidence-index]');
  if (!button) return;
  const index = Number(button.dataset.readingCardEvidenceIndex);
  const unit = evidenceByIndex.get(index);
  if (unit) onOpenEvidence(unit.id);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function readingCardSectionIndex(title: string) {
  const order = [
    '一句话带走',
    '我停下来的地方',
    '改变 / 确认 / 怀疑',
    '改变／确认／怀疑',
    '还没想通的问题',
    '还没收束的问题',
    '可保存成稿',
    '核心主张',
    '我关注了什么',
    '讨论中浮现了什么',
    '可复用洞见',
    '后续行动线索',
  ];
  const index = order.indexOf(title);
  return index >= 0 ? String(index + 1).padStart(2, '0') : '·';
}
