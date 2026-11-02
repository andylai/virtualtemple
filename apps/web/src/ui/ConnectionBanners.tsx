import { useT } from '../i18n/I18nProvider';
import { useOnline } from './useOnline';

/** Tells the visitor when the device is offline, which explains a stalled hall better than a retry. */
export function OfflineBanner() {
  const t = useT();
  return useOnline() ? null : (
    <div className="banner" role="status">
      {t('status.offline')}
    </div>
  );
}

/** Tells the visitor that the 3D picture stopped, for example when the phone took the graphics back. */
export function PictureLostBanner({ lost }: { lost: boolean }) {
  const t = useT();
  return lost ? (
    <div className="banner" role="alert">
      {t('error.pictureLost')}
    </div>
  ) : null;
}
