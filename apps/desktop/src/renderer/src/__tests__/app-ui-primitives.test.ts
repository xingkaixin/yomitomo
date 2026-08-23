import { describe, expect, it } from 'vitest';
import { Dialog as SharedDialog } from '@yomitomo/reader-ui/ui-dialog';
import {
  DropdownMenu as SharedDropdownMenu,
  DropdownMenuItem as SharedDropdownMenuItem,
  DropdownMenuTrigger as SharedDropdownMenuTrigger,
} from '@yomitomo/reader-ui/ui-dropdown-menu';
import { Kbd as SharedKbd } from '@yomitomo/reader-ui/ui-kbd';
import {
  Popover as SharedPopover,
  PopoverTrigger as SharedPopoverTrigger,
} from '@yomitomo/reader-ui/ui-popover';
import { composePopupClassName as sharedComposePopupClassName } from '@yomitomo/reader-ui/ui-popup-class-name';
import { Dialog } from '../components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { Kbd } from '../components/ui/kbd';
import { Popover, PopoverTrigger } from '../components/ui/popover';
import { composePopupClassName } from '../components/ui/popup-class-name';

describe('desktop UI primitives', () => {
  it('reuses shared behavior while desktop content wrappers keep their own appearance', () => {
    expect(Dialog).toBe(SharedDialog);
    expect(Kbd).toBe(SharedKbd);
    expect(DropdownMenu).toBe(SharedDropdownMenu);
    expect(DropdownMenuTrigger).toBe(SharedDropdownMenuTrigger);
    expect(DropdownMenuItem).toBe(SharedDropdownMenuItem);
    expect(Popover).toBe(SharedPopover);
    expect(PopoverTrigger).toBe(SharedPopoverTrigger);
    expect(composePopupClassName).toBe(sharedComposePopupClassName);
  });
});
