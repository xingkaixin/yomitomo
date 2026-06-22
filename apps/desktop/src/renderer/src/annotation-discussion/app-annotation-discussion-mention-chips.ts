import type { Comment, PublicAgent } from '@yomitomo/shared';
import { renderSafeMarkdown } from '@yomitomo/core/article-extraction';
import {
  hasMatchedAgentMention,
  mentionChipSegments,
} from '@yomitomo/reader-ui/reader-mention-utils';

type RenderMentionChipOptions = {
  articleDocument?: Document;
  includeNameMatches?: boolean;
};

export function renderDiscussionMessageMarkdown(
  content: string,
  agents: PublicAgent[],
  author: Comment['author'],
  articleDocument?: Document,
) {
  const html = renderSafeMarkdown(content, articleDocument);
  return renderMentionChipHtml(html, agents, {
    articleDocument,
    includeNameMatches: shouldUseAssistantNameFallback(content, agents, author),
  });
}

export function renderMentionChipHtml(
  html: string,
  agents: PublicAgent[],
  options: RenderMentionChipOptions = {},
) {
  if (agents.length === 0 || !html) return html;

  const articleDocument = options.articleDocument || document;
  const template = articleDocument.createElement('template');
  template.innerHTML = html;
  const textNodes = mentionTextNodes(articleDocument, template.content);

  for (const textNode of textNodes) {
    const content = textNode.nodeValue || '';
    const segments = mentionChipSegments(content, agents, {
      includeNameMatches: options.includeNameMatches,
    });
    if (!segments.some((segment) => segment.type === 'agent')) continue;

    const fragment = articleDocument.createDocumentFragment();
    for (const segment of segments) {
      if (segment.type === 'text') {
        fragment.append(articleDocument.createTextNode(segment.text));
        continue;
      }
      const chip = articleDocument.createElement('span');
      chip.className = 'annotation-discussion-mention-chip';
      chip.dataset.agentId = segment.agent.id;
      chip.dataset.mentionSource = segment.source;
      chip.textContent = segment.text;
      const accent = normalizedMentionColor(segment.agent.annotationColor);
      if (accent) chip.style.setProperty('--mention-accent', accent);
      fragment.append(chip);
    }
    textNode.replaceWith(fragment);
  }

  return template.innerHTML;
}

function shouldUseAssistantNameFallback(
  content: string,
  agents: PublicAgent[],
  author: Comment['author'],
) {
  return author === 'ai' && !hasMatchedAgentMention(content, agents);
}

function mentionTextNodes(articleDocument: Document, root: DocumentFragment) {
  const textNodes: Text[] = [];
  const showText = articleDocument.defaultView?.NodeFilter.SHOW_TEXT ?? 4;
  const walker = articleDocument.createTreeWalker(root, showText);

  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node instanceof Text && !isSkippedMentionTextNode(node, root)) textNodes.push(node);
  }

  return textNodes;
}

function isSkippedMentionTextNode(textNode: Text, root: DocumentFragment) {
  let node: Node | null = textNode.parentNode;

  while (node && node !== root) {
    if (node instanceof HTMLElement) {
      const tagName = node.tagName.toLowerCase();
      if (tagName === 'a' || tagName === 'code' || tagName === 'pre') return true;
      if (node.classList.contains('annotation-discussion-mention-chip')) return true;
    }
    node = node.parentNode;
  }

  return false;
}

function normalizedMentionColor(value: string) {
  return /^#[0-9a-f]{3}([0-9a-f]{3})?$/iu.test(value) ? value : '';
}
