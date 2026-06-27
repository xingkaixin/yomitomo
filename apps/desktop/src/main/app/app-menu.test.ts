import { describe, expect, it, vi } from 'vitest';
import type { MenuItemConstructorOptions } from 'electron';
import { buildAppMenuTemplate, installAppMenu, type AppMenuOptions } from './app-menu';

const electronMocks = vi.hoisted(() => ({
  buildFromTemplate: vi.fn((template: MenuItemConstructorOptions[]) => ({ template })),
  setApplicationMenu: vi.fn(),
}));

vi.mock('electron', () => ({
  Menu: {
    buildFromTemplate: electronMocks.buildFromTemplate,
    setApplicationMenu: electronMocks.setApplicationMenu,
  },
}));

describe('app menu', () => {
  it('removes reload and devtools commands in packaged builds', () => {
    const template = buildAppMenuTemplate(menuOptions({ isPackaged: true }));
    const viewRoles = submenuRoles(topLevelSubmenu(template, 'View'));

    expect(viewRoles).not.toContain('reload');
    expect(viewRoles).not.toContain('forceReload');
    expect(viewRoles).not.toContain('toggleDevTools');
  });

  it('keeps reload and devtools commands in development builds', () => {
    const template = buildAppMenuTemplate(menuOptions({ isPackaged: false }));
    const viewRoles = submenuRoles(topLevelSubmenu(template, 'View'));

    expect(viewRoles).toEqual(expect.arrayContaining(['reload', 'forceReload', 'toggleDevTools']));
  });

  it('logs the installed menu branch', () => {
    const logInfo = vi.fn();

    installAppMenu({ ...menuOptions({ isPackaged: true }), logInfo });

    expect(electronMocks.buildFromTemplate).toHaveBeenCalledOnce();
    expect(electronMocks.setApplicationMenu).toHaveBeenCalledOnce();
    expect(logInfo).toHaveBeenCalledWith('app.menu.installed', {
      platform: 'darwin',
      packaged: true,
      reloadCommandsEnabled: false,
      topLevelMenus: ['Yomitomo', 'File', 'Edit', 'View', 'Window', 'Help'],
    });
  });
});

function menuOptions(overrides: Partial<AppMenuOptions> = {}): AppMenuOptions {
  return {
    appName: 'Yomitomo',
    isPackaged: true,
    locale: 'en-US',
    onCommand: vi.fn(),
    platform: 'darwin',
    ...overrides,
  };
}

function topLevelSubmenu(template: MenuItemConstructorOptions[], label: string) {
  const item = template.find((entry) => entry.label === label);
  expect(item).toBeTruthy();
  return submenuItems(item);
}

function submenuItems(item: MenuItemConstructorOptions | undefined): MenuItemConstructorOptions[] {
  const submenu = item?.submenu;
  return Array.isArray(submenu) ? submenu : [];
}

function submenuRoles(items: MenuItemConstructorOptions[]): unknown[] {
  return items.flatMap((item) => [item.role, ...submenuRoles(submenuItems(item))].filter(Boolean));
}
