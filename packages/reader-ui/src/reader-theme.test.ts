import { describe, expect, it } from 'vitest';
import {
  readerThemeToCssVariables,
  readerThemeVariableNames,
  type ReaderTheme,
} from './reader-theme';

const theme: ReaderTheme = {
  background: '#f5f1e8',
  paper: '#fffdf8',
  ink: '#28231d',
  muted: '#746d63',
  line: '#e3dccf',
  primary: '#28231d',
  accent: '#ead89d',
  accentStrong: '#c7a45e',
  danger: '#9f5b50',
  toolbar: {
    background: 'rgba(255,253,248,.9)',
    border: 'rgba(40,35,29,.1)',
    controlBackground: 'rgba(255,253,248,.84)',
    controlHoverBackground: '#f0eadf',
    progressTrack: 'rgba(40,35,29,.1)',
    progressFill: '#c7a45e',
  },
  toc: {
    background: 'rgba(250,247,240,.62)',
    itemHoverBackground: 'rgba(255,253,248,.82)',
  },
  note: {
    annotationAccent: 'var(--app-reader-accent-strong)',
    annotationBorder:
      'color-mix(in srgb,var(--app-reader-accent-strong) 24%,var(--app-reader-note-border))',
    annotationMat: 'color-mix(in srgb,var(--app-reader-accent) 20%,var(--app-reader-paper))',
    background: 'rgba(255,253,248,.88)',
    border: 'rgba(40,35,29,.1)',
    distillationAccent: 'var(--app-reader-accent-strong)',
    distillationBorder:
      'color-mix(in srgb,var(--app-reader-accent-strong) 46%,var(--app-reader-note-border))',
    distillationMat: 'color-mix(in srgb,var(--app-reader-accent) 34%,var(--app-reader-note-bg))',
    distillationTabForeground: '#fffdf8',
    shadow: '0 8px 24px rgba(40,35,29,.07)',
    quoteBackground: 'rgba(234,216,157,.18)',
    quoteText: '#3f352c',
  },
  selectionMenu: {
    background: 'rgba(39,36,32,.92)',
    foreground: '#fff8e8',
    border: 'rgba(40,35,29,.12)',
    shadow: '0 12px 34px rgba(37,29,22,.28)',
  },
  composer: {
    background: 'rgba(255,253,248,.98)',
    border: 'rgba(40,35,29,.14)',
    shadow: '0 22px 64px rgba(40,35,29,.18)',
  },
  chat: {
    panelBackground: 'rgba(255,253,248,.98)',
    panelBorder: 'rgba(40,35,29,.12)',
    panelShadow: '0 28px 88px rgba(40,35,29,.24)',
    userBubbleBackground: '#28231d',
    userBubbleForeground: '#fffaf0',
    assistantBubbleBackground: 'rgba(40,35,29,.06)',
    assistantBubbleForeground: '#28231d',
    contextBackground: 'rgba(234,216,157,.22)',
    contextBorder: 'rgba(199,164,94,.2)',
    contextForeground: '#5c5147',
    composerBackground: 'rgba(255,253,248,.98)',
    composerBorder: 'rgba(40,35,29,.09)',
    sendBackground: '#28231d',
    sendForeground: '#fffaf0',
    sendDisabledBackground: 'rgba(40,35,29,.16)',
    sendDisabledForeground: 'rgba(40,35,29,.48)',
  },
  agentPanel: {
    background: 'rgba(255,250,240,.92)',
    border: 'rgba(37,29,22,.12)',
    hoverBackground: '#f0e3cd',
  },
  overlay: {
    scrim: 'rgba(40,35,29,.14)',
    edgeBlurTop: 'linear-gradient(to bottom,rgba(245,241,232,.82),rgba(245,241,232,0))',
    edgeBlurBottom: 'linear-gradient(to top,rgba(245,241,232,.82),rgba(245,241,232,0))',
  },
};

describe('reader theme contract', () => {
  it('exports every required reader variable from a complete theme', () => {
    const variables = readerThemeToCssVariables(theme);

    expect(Object.keys(variables).toSorted()).toEqual([...readerThemeVariableNames].toSorted());
    for (const name of readerThemeVariableNames) {
      expect(variables[name]).toBeTruthy();
    }
  });
});
