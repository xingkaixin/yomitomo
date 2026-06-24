// @vitest-environment jsdom

import React from 'react';
import { describe, expect, it } from 'vitest';
import { TooltipProvider } from '../components/ui/tooltip';
import { ReaderTooltip, ReaderTooltipProvider } from './reader-component-primitives';

describe('ReaderTooltipProvider', () => {
  it('centralizes reader tooltip timing outside individual tooltip instances', () => {
    const children = <span>内容</span>;
    const provider = ReaderTooltipProvider({ children });

    expect(provider.type).toBe(TooltipProvider);
    expect(provider.props.delayDuration).toBe(360);
    expect(provider.props.skipDelayDuration).toBe(80);
    expect(provider.props.children).toBe(children);

    const trigger = <button type="button">Hover</button>;
    const tooltip = ReaderTooltip({ children: trigger, content: '提示' });

    expect(tooltip.type).not.toBe(TooltipProvider);
  });
});
