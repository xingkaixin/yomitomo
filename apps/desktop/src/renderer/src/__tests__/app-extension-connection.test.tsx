// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ExtensionConnectionButton,
  ExtensionConnectionDialog,
  getExtensionConnectionView,
} from '../app-extension-connection';

const pairingInfo = {
  token: 'desktop-token',
  pairingId: 'YMT-123456',
  updatedAt: '2026-05-04T00:00:00.000Z',
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('getExtensionConnectionView', () => {
  it('maps missing pairing info to the unpaired state', () => {
    expect(getExtensionConnectionView(null, { authenticatedSocketCount: 0 })).toEqual({
      state: 'unpaired',
      title: '未配对',
      description: '生成配对码后，在浏览器扩展端输入即可连接。',
      sidebarDetail: '点击生成配对码',
    });
  });

  it('maps saved pairing without reader sessions to the idle state', () => {
    expect(getExtensionConnectionView(pairingInfo, { authenticatedSocketCount: 0 })).toEqual({
      state: 'idle',
      title: '扩展未工作',
      description: '打开浏览器阅读器后会自动连接本机。',
      sidebarDetail: 'YMT-123456',
    });
  });

  it('maps active reader sessions to the connected state', () => {
    expect(getExtensionConnectionView(pairingInfo, { authenticatedSocketCount: 2 })).toEqual({
      state: 'connected',
      title: '已联通',
      description: '2 个阅读器会话正在连接本机',
      sidebarDetail: 'YMT-123456',
    });
  });
});

describe('ExtensionConnectionButton', () => {
  it('opens from the unpaired sidebar state', () => {
    const onClick = vi.fn();
    render(
      <ExtensionConnectionButton
        pairingInfo={null}
        pairingConnectionStatus={{ authenticatedSocketCount: 0 }}
        onClick={onClick}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '扩展状态：未配对' }));

    expect(screen.getByText('点击生成配对码')).toBeTruthy();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('shows the pairing identity for saved idle connections', () => {
    render(
      <ExtensionConnectionButton
        pairingInfo={pairingInfo}
        pairingConnectionStatus={{ authenticatedSocketCount: 0 }}
        onClick={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '扩展状态：扩展未工作' })).toBeTruthy();
    expect(screen.getByText('YMT-123456')).toBeTruthy();
  });
});

describe('ExtensionConnectionDialog', () => {
  it('generates a pairing code from the unpaired dialog', () => {
    const onRotatePairing = vi.fn();
    render(
      <ExtensionConnectionDialog
        pairingInfo={null}
        pairingConnectionStatus={{ authenticatedSocketCount: 0 }}
        onClose={vi.fn()}
        onRotatePairing={onRotatePairing}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /生成配对码/ }));

    expect(screen.getByText('等待生成')).toBeTruthy();
    expect(onRotatePairing).toHaveBeenCalledTimes(1);
  });

  it('shows active reader session details for connected extensions', () => {
    render(
      <ExtensionConnectionDialog
        pairingInfo={pairingInfo}
        pairingConnectionStatus={{ authenticatedSocketCount: 1 }}
        onClose={vi.fn()}
        onRotatePairing={vi.fn()}
      />,
    );

    expect(screen.getByText('已联通')).toBeTruthy();
    expect(screen.getByText('1 个阅读器会话正在连接本机')).toBeTruthy();
    expect(screen.getByText('YMT-123456')).toBeTruthy();
    expect(screen.getByRole('button', { name: '复制配对码' })).toBeTruthy();
  });
});
