import React, { useMemo } from 'react';
import type { ArticleRecord } from '@yomitomo/shared';

type ArticleBookStyle = React.CSSProperties & {
  '--book-hue': string;
  '--book-saturation': string;
  '--book-lightness': string;
  '--book-accent-hue': string;
};

export function ArticleBook({ article }: { article: ArticleRecord }) {
  const visual = useMemo(() => articleBookVisual(article), [article]);

  return (
    <span
      aria-hidden="true"
      className={visual.hasImage ? 'article-book has-image' : 'article-book'}
      data-pattern={visual.pattern}
      style={visual.style}
    >
      <span className="article-book-ground-shadow" />
      <span className="article-book-scene">
        <span className="article-book-cover">
          {visual.imageUrl ? (
            <img
              alt=""
              className="article-book-cover-image"
              src={visual.imageUrl}
              onError={(event) => {
                event.currentTarget.hidden = true;
              }}
            />
          ) : null}
          <span className="article-book-cover-pattern" />
          <span className="article-book-cover-sheen" />
          <span className="article-book-cover-copy">
            <strong>
              {visual.titleLines.map((line, index) => (
                <span key={`${index}-${line}`}>{line}</span>
              ))}
            </strong>
          </span>
          {visual.bylineLabel ? <em>{visual.bylineLabel}</em> : null}
        </span>
      </span>
    </span>
  );
}

function articleBookVisual(article: ArticleRecord) {
  const seed = stableHash(
    [article.id, article.canonicalUrl, article.title, article.siteName, article.contentHash].join(
      '|',
    ),
  );
  const base = colorFromArticle(article, seed);
  const pattern = seed % 6;
  const imageUrl = safeHttpUrl(article.leadImageUrl);

  return {
    bylineLabel: compactLabel(article.byline || '', 12),
    hasImage: Boolean(imageUrl),
    imageUrl,
    pattern,
    style: {
      '--book-hue': String(base.hue),
      '--book-saturation': `${base.saturation}%`,
      '--book-lightness': `${base.lightness}%`,
      '--book-accent-hue': String((base.hue + 48 + pattern * 23) % 360),
    } satisfies ArticleBookStyle,
    titleLines: wrapTitle(article.title),
  };
}

function wrapTitle(value: string) {
  const title = value.replace(/\s+/g, ' ').trim();
  const hasCjk = /[\u3400-\u9fff]/.test(title);
  const maxLines = 5;
  const maxChars = hasCjk ? 5 : 10;

  if (hasCjk || !title.includes(' ')) {
    return Array.from({ length: maxLines }, (_, index) =>
      title.slice(index * maxChars, (index + 1) * maxChars),
    ).filter(Boolean);
  }

  const lines: string[] = [];
  for (const word of title.split(' ')) {
    const croppedWord = word.length > maxChars ? word.slice(0, maxChars) : word;
    const current = lines[lines.length - 1] || '';
    const next = current ? `${current} ${croppedWord}` : croppedWord;
    if (!current) {
      lines.push(next);
    } else if (next.length <= maxChars) {
      lines[lines.length - 1] = next;
    } else if (lines.length < maxLines) {
      lines.push(croppedWord);
    } else {
      break;
    }
  }
  return lines.slice(0, maxLines);
}

function compactLabel(value: string, maxLength: number) {
  const normalized = value
    .replace(/^www\./, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (normalized.length <= maxLength) return normalized.toUpperCase();
  return `${normalized.slice(0, Math.max(1, maxLength - 3)).toUpperCase()}...`;
}

function colorFromArticle(article: ArticleRecord, seed: number) {
  const theme = hexToRgb(article.themeColor);
  if (theme) return rgbToHsl(theme);

  return {
    hue: seed % 360,
    saturation: 34 + (seed % 22),
    lightness: 42 + ((seed >> 4) % 16),
  };
}

function safeHttpUrl(value: string | undefined) {
  if (!value) return undefined;
  if (value.startsWith('data:image/')) return value;
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
  } catch {
    return undefined;
  }
  return undefined;
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hexToRgb(value: string | undefined) {
  if (!value) return null;
  const normalized = value.trim();
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(normalized);
  if (!match) return null;
  const hex =
    match[1].length === 3
      ? match[1]
          .split('')
          .map((char) => char + char)
          .join('')
      : match[1];
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

function rgbToHsl({ r, g, b }: { r: number; g: number; b: number }) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const delta = max - min;

  if (delta === 0) {
    return { hue: 42, saturation: 22, lightness: Math.round(lightness * 100) };
  }

  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  const hue =
    max === red
      ? 60 * (((green - blue) / delta) % 6)
      : max === green
        ? 60 * ((blue - red) / delta + 2)
        : 60 * ((red - green) / delta + 4);

  return {
    hue: Math.round((hue + 360) % 360),
    saturation: Math.round(Math.min(62, Math.max(28, saturation * 100))),
    lightness: Math.round(Math.min(60, Math.max(34, lightness * 100))),
  };
}
