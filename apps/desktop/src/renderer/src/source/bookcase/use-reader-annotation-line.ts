import type { ReaderAnnotationLineControl } from '@yomitomo/reader-ui/reader-toolbar-controls';
import type { UserProfile } from '@yomitomo/shared';
import { userAnnotationColors } from '../../settings/app-settings';
import { getDesktopApi } from '../../shell/app-desktop-api';
import { useDesktopStoreApi } from '../../shell/app-desktop-store';

export function useReaderAnnotationLine(userProfile: UserProfile): ReaderAnnotationLineControl {
  const desktopStore = useDesktopStoreApi();
  return {
    colors: userAnnotationColors,
    value: userProfile.annotationColor,
    onChange: (annotationColor) => {
      void getDesktopApi()
        .store.saveUser({ annotationColor })
        .then((patch) => {
          if (patch) desktopStore.getState().applySettingsPatch(patch);
        })
        // A failed save keeps the previous color, which the toolbar still shows as selected.
        .catch(() => undefined);
    },
  };
}
