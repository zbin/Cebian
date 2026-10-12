import { useEffect, useSyncExternalStore } from 'react';
import type { LocalePreference } from '@/lib/persistence/storage';
import { localeSnapshot, startLocaleSync, subscribeLocale } from '@/lib/i18n';

export function useLocale(): LocalePreference | null {
  const locale = useSyncExternalStore(subscribeLocale, localeSnapshot, localeSnapshot);
  useEffect(() => {
    void startLocaleSync();
  }, []);
  return locale;
}
