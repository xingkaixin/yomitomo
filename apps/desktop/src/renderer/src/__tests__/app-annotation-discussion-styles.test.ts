import { readRendererStyles } from './css-test-utils';
import { describe, expect, it } from 'vitest';

const styles = readRendererStyles();

describe('annotation discussion styles', () => {
  it('does not replay tooltip enter animation for instant hover opens', () => {
    expect(styles).toMatch(
      /\.reader-tooltip-content\[data-state='delayed-open'\] \{[\s\S]*animation: reader-tooltip-in 120ms ease-out;[\s\S]*\}/,
    );
    expect(styles).not.toContain(".reader-tooltip-content[data-state='instant-open']");
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.reader-tooltip-content \{[\s\S]*animation: none !important;[\s\S]*will-change: auto;[\s\S]*\}/,
    );
  });

  it('keeps the add thought modal editor integrated with the modal shell', () => {
    expect(styles).toMatch(
      /\.floating-composer\.annotation-discussion-add-editor \{[\s\S]*border: 0;[\s\S]*border-radius: 0 0 16px 16px;[\s\S]*box-shadow: none;[\s\S]*\}/,
    );
  });

  it('keeps discussion assistant avatar stacks connected to proximity hover variables', () => {
    expect(styles).toMatch(
      /\.annotation-discussion-add-agents \.reader-agent-avatar-stack-item \{[\s\S]*transform: translateY\(var\(--avatar-shift, 0px\)\) scale\(var\(--avatar-scale-active, 1\)\);[\s\S]*transition:[\s\S]*transform var\(--avatar-dur, 320ms\) var\(--avatar-ease-in, cubic-bezier\(0\.22, 1, 0\.36, 1\)\)[\s\S]*will-change: transform;[\s\S]*\}/,
    );
    expect(styles).toMatch(
      /\.annotation-discussion-agent-dock \.reader-agent-avatar-stack-item \{[\s\S]*transform: translateY\(var\(--avatar-shift, 0px\)\) scale\(var\(--avatar-scale-active, 1\)\);[\s\S]*transition:[\s\S]*transform var\(--avatar-dur, 320ms\) var\(--avatar-ease-in, cubic-bezier\(0\.22, 1, 0\.36, 1\)\)[\s\S]*will-change: transform;[\s\S]*\}/,
    );
  });

  it('draws an ink line under writing assistants and settles it on completion', () => {
    expect(styles).toMatch(
      /\.annotation-discussion-add-run-agent\.is-active \.annotation-discussion-add-run-inkline::before \{[\s\S]*animation: annotation-discussion-add-ink-write 1\.15s ease-in-out infinite;[\s\S]*\}/,
    );
    expect(styles).toMatch(
      /\.annotation-discussion-add-run-agent\.is-done \.annotation-discussion-add-run-inkline::after \{[\s\S]*transform: scaleX\(1\);[\s\S]*\}/,
    );
    expect(styles).toMatch(
      /\.annotation-discussion-add-run-agent\.is-done \.annotation-discussion-add-run-avatar \{[\s\S]*animation: annotation-discussion-add-avatar-settle 0\.5s/,
    );
    expect(styles).toMatch(
      /\.annotation-discussion-add-run-writing-avatar \{[\s\S]*width: 42px;[\s\S]*height: 42px;[\s\S]*background-size: var\(--agent-writing-sheet-width\) 42px;[\s\S]*animation: annotation-discussion-add-writing-avatar var\(--agent-writing-duration\) steps\(7\)[\s\S]*infinite;[\s\S]*\}/,
    );
    expect(styles).toMatch(
      /@keyframes annotation-discussion-add-writing-avatar \{[\s\S]*background-position-x: var\(--agent-writing-travel\);[\s\S]*\}/,
    );
    expect(styles).not.toContain('annotation-discussion-add-agent-sway');
    expect(styles).not.toContain('reader-completion-burst');
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.annotation-discussion-add-run-agent\.is-active \.annotation-discussion-add-run-inkline::before \{[\s\S]*animation: none;[\s\S]*\}/,
    );
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.annotation-discussion-add-run-writing-avatar \{[\s\S]*animation: none;[\s\S]*\}/,
    );
  });

  it('keeps the discussion idea sidebar usable when collapsed', () => {
    expect(styles).toMatch(
      /\.annotation-discussion-layout\.is-ideas-collapsed \{[\s\S]*grid-template-columns: var\(--annotation-discussion-ideas-rail-width\) minmax\(0, 1fr\);[\s\S]*\}/,
    );
    expect(styles).toContain(
      '--annotation-discussion-ideas-overlay-width: clamp(260px, 42%, 340px);',
    );
    expect(styles).toContain('--annotation-discussion-ideas-rail-width: 68px;');
    expect(styles).not.toContain('.annotation-discussion-layout.is-ideas-overlay-open {');
    expect(styles).toMatch(
      /\.annotation-discussion-layout\.is-ideas-content-collapsed \.annotation-discussion-idea-list,[\s\S]*\.annotation-discussion-layout\.is-ideas-content-collapsed \.annotation-discussion-ideas > p \{[\s\S]*display: none;[\s\S]*\}/,
    );
    expect(styles).toMatch(
      /\.annotation-discussion-layout\.is-ideas-content-collapsed \.annotation-discussion-ideas-toggle \{[\s\S]*width: 40px;[\s\S]*height: 40px;[\s\S]*\}/,
    );
    expect(styles).toMatch(
      /\.annotation-discussion-layout\.is-ideas-content-collapsed \.annotation-discussion-ideas-count \{[\s\S]*min-width: 40px;[\s\S]*height: 40px;[\s\S]*\}/,
    );
    expect(styles).toMatch(
      /\.annotation-discussion-layout\.is-ideas-content-collapsed \.annotation-discussion-add-thought \{[\s\S]*width: 40px;[\s\S]*height: 40px;[\s\S]*\}/,
    );
    expect(styles).toMatch(
      /\.annotation-discussion-layout\.is-ideas-content-collapsed[\s\S]*\.annotation-discussion-sedimentation-entry[\s\S]*button \{[\s\S]*width: 40px;[\s\S]*min-height: 40px;[\s\S]*\}/,
    );
    expect(styles).not.toContain('.annotation-discussion-layout.is-ideas-overlay-open::after {');
    expect(styles).toContain(
      '.annotation-discussion-layout.is-ideas-overlay-open .annotation-discussion-ideas {',
    );
    expect(styles).toContain('z-index: 12;');
    expect(styles).toContain('width: var(--annotation-discussion-ideas-overlay-width);');
    expect(styles).toContain('background: var(--app-reader-paper);');
    expect(styles).toContain('18px 0 46px color-mix');
    expect(styles).toContain(
      '.annotation-discussion-layout.is-ideas-overlay-open .annotation-discussion-ideas header {',
    );
    expect(styles).toContain('grid-template-columns: 40px auto minmax(0, 1fr) 40px;');
    expect(styles).toContain(
      '.annotation-discussion-layout.is-ideas-overlay-open .annotation-discussion-thread {',
    );
    expect(styles).toContain('grid-column: 1 / -1;');
    expect(styles).toContain('grid-row: 1;');
    expect(styles).not.toContain(
      'is-ideas-overlay-open .annotation-discussion-thread {\n  padding',
    );
  });

  it('switches sedimentation document actions to icon buttons in narrow windows', () => {
    expect(styles).toContain('flex: 0 0 auto;');
    expect(styles).toContain('white-space: nowrap;');
    expect(styles).toContain('.annotation-sedimentation-action-tooltip {');
    expect(styles).toContain('max-width: 260px;');
    expect(styles).toContain('@media (max-width: 1040px) {');
    expect(styles).toContain(`  .annotation-sedimentation-document > header button {
    width: 40px;
    padding: 0;
  }`);
    expect(styles).toContain(`  .annotation-sedimentation-document > header button span {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }`);
  });
});
