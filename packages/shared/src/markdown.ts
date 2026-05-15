export function renderMarkdown(content: string): string {
  return renderMarkdownBlocks(content);
}

function renderMarkdownBlocks(content: string) {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const blocks: string[] = [];

  for (let index = 0; index < lines.length; ) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.match(/^```/)) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].match(/^```/)) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(`<h${level}>${renderMarkdownInline(heading[2].trim())}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/, ''));
        index += 1;
      }
      blocks.push(`<blockquote>${renderParagraph(quoteLines)}</blockquote>`);
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        items.push(`<li>${renderMarkdownInline(lines[index].replace(/^\s*[-*+]\s+/, ''))}</li>`);
        index += 1;
      }
      blocks.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        items.push(`<li>${renderMarkdownInline(lines[index].replace(/^\s*\d+\.\s+/, ''))}</li>`);
        index += 1;
      }
      blocks.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !lines[index].startsWith('```') &&
      !/^(#{1,6})\s+/.test(lines[index]) &&
      !/^\s*>\s?/.test(lines[index]) &&
      !/^\s*[-*+]\s+/.test(lines[index]) &&
      !/^\s*\d+\.\s+/.test(lines[index])
    ) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    blocks.push(`<p>${renderParagraph(paragraphLines)}</p>`);
  }

  return blocks.join('');
}

function renderParagraph(lines: string[]) {
  return lines.map((line) => renderMarkdownInline(line)).join('<br>');
}

function renderMarkdownInline(content: string) {
  const tokens: string[] = [];
  const token = (value: string) => {
    const id = `@@YOMITOMOMD${tokens.length}@@`;
    tokens.push(value);
    return id;
  };

  let text = content.replace(/`([^`]+)`/g, (_match, code: string) =>
    token(`<code>${escapeHtml(code)}</code>`),
  );
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, label: string, href: string) => {
    if (!/^(https?:\/\/|mailto:)/i.test(href)) return escapeHtml(label);
    const safeHref = escapeHtml(href);
    return token(`<a href="${safeHref}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`);
  });

  text = escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|[^_])_([^_]+)_/g, '$1<em>$2</em>');

  tokens.forEach((value, index) => {
    text = text.replace(`@@YOMITOMOMD${index}@@`, value);
  });

  return text;
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
