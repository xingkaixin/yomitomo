import type React from 'react';
import { AvatarBadge } from '../shared/reader-component-primitives';
import { cursorColorFromId, cursorSvgId, VIRTUAL_CURSOR_PATH } from '../reader-style-utils';
import type { VirtualCursorState } from '../reader-types';

type VirtualCursorStyle = React.CSSProperties & {
  '--cursor-color': string;
  '--reader-cursor-x': string;
  '--reader-cursor-y': string;
};

export function VirtualCursor({ cursor }: { cursor: VirtualCursorState }) {
  const color = cursor.agent?.annotationColor || cursorColorFromId(cursor.id);
  const gradientId = cursorSvgId('reader-cursor-fill', cursor.id);
  const bloomId = cursorSvgId('reader-cursor-bloom', cursor.id);
  const style: VirtualCursorStyle = {
    '--cursor-color': color,
    '--reader-cursor-x': `${cursor.x}px`,
    '--reader-cursor-y': `${cursor.y}px`,
  };
  return (
    <div
      className={[
        'reader-virtual-cursor',
        cursor.offscreen ? 'is-offscreen' : '',
        cursor.leaving ? 'is-leaving' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
    >
      <svg
        aria-hidden="true"
        className="reader-virtual-pointer"
        focusable="false"
        viewBox="0 0 48 48"
      >
        <defs>
          <radialGradient id={bloomId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={color} stopOpacity="0.55" />
            <stop offset="52%" stopColor={color} stopOpacity="0.15" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </radialGradient>
          <linearGradient
            gradientUnits="userSpaceOnUse"
            id={gradientId}
            x1="10"
            x2="32"
            y1="10"
            y2="32"
          >
            <stop offset="0%" stopColor="#DBEEEF" />
            <stop offset="53%" stopColor={color} />
            <stop offset="100%" stopColor="#54CDA0" />
          </linearGradient>
        </defs>
        <ellipse
          className="reader-virtual-bloom"
          cx="23"
          cy="23"
          fill={`url(#${bloomId})`}
          rx="22"
          ry="15"
          transform="rotate(-45 23 23)"
        />
        <path
          className="reader-virtual-pointer-shape"
          d={VIRTUAL_CURSOR_PATH}
          fill={`url(#${gradientId})`}
        />
      </svg>
      <div className="reader-virtual-label">
        <AvatarBadge avatar={cursor.agent?.avatar} />
        {cursor.label}
      </div>
    </div>
  );
}
