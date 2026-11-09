import type { IconSvgElement } from '@hugeicons/react';

const stroke = {
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  strokeWidth: '1.5',
} as const;

// Matches the open crate collections use on the bookshelf; drawn in the Hugeicons
// 24px grid so it renders through HugeiconsIcon like the stock icons.
export const CollectionIcon: IconSvgElement = [
  ['rect', { x: '3', y: '12.5', width: '18', height: '8', rx: '1.5', ...stroke, key: '0' }],
  ['path', { d: 'M10.25 15.75H13.75', ...stroke, key: '1' }],
  ['path', { d: 'M5.75 12.5V5A1 1 0 0 1 6.75 4H9.25A1 1 0 0 1 10.25 5V12.5', ...stroke, key: '2' }],
  [
    'path',
    {
      d: 'M12.75 12.5L13.7 7.3A1 1 0 0 1 14.85 6.5L17.1 6.9A1 1 0 0 1 17.9 8.05L17.25 12.5',
      ...stroke,
      key: '3',
    },
  ],
];
