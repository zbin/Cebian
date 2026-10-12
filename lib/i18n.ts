import { i18n } from '#i18n';
import {
  localePreference,
  resolveLocalePreference,
  type LocalePreference,
} from '@/lib/persistence/storage';

type ExplicitLocale = Exclude<LocalePreference, 'system'>;
type LocaleMessages = Record<string, { message: string }>;
type NamedSubstitutions = Record<string, string | number>;

const EMPTY_SUBSTITUTIONS: readonly (string | number)[] = [];
const nativeTranslate = i18n.t as unknown as (key: string, ...args: unknown[]) => string;
const messagesByLocale: Partial<Record<ExplicitLocale, LocaleMessages>> = {};
const localeLoads: Partial<Record<ExplicitLocale, Promise<LocaleMessages>>> = {};
const localeListeners = new Set<() => void>();
let activeLocale: LocalePreference | null = null;

function applySubstitutions(message: string, values: readonly (string | number)[]): string {
  return message.replace(/\$\$|\$([1-9])/g, (match, index: string | undefined) => {
    if (index === undefined) return '$';
    const value = values[Number(index) - 1];
    return String(value ?? '');
  });
}

function selectPlural(message: string, count: number): string {
  const forms = message.split(' | ');
  switch (forms.length) {
    case 1:
      return forms[0];
    case 2:
      return forms[count === 1 ? 0 : 1];
    case 3:
      return forms[count === 0 || count === 1 ? count : 2];
    default:
      throw new Error('Unknown plural formatting');
  }
}

function applyNamedSubstitutions(message: string, values: NamedSubstitutions): string {
  return message.replace(/\{([A-Za-z0-9_]+)\}/g, (match, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : match,
  );
}

function translate(key: string, ...args: unknown[]): string {
  if (activeLocale === null || activeLocale === 'system' || key.startsWith('@@')) return nativeTranslate(key, ...args);

  let count: number | undefined;
  let substitutions: readonly (string | number)[] | undefined;
  let named: NamedSubstitutions | undefined;
  args.forEach((arg, index) => {
    if (arg == null) return;
    if (typeof arg === 'number') count = arg;
    else if (Array.isArray(arg)) substitutions = arg as (string | number)[];
    else if (typeof arg === 'object') named = arg as NamedSubstitutions;
    else throw new Error(`Unknown argument at index ${index}.`);
  });

  const message = messagesByLocale[activeLocale]?.[key.replaceAll('.', '_')]?.message;
  if (message === undefined) return nativeTranslate(key, ...args);

  const values = substitutions ?? (count === undefined ? EMPTY_SUBSTITUTIONS : [count]);
  const pluralForm = count === undefined ? message : selectPlural(message, count);
  let translated = applySubstitutions(pluralForm, values);
  if (named) translated = applyNamedSubstitutions(translated, named);
  return translated;
}

function loadLocaleMessages(locale: ExplicitLocale): Promise<LocaleMessages> {
  const cached = messagesByLocale[locale];
  if (cached) return Promise.resolve(cached);
  const loading = localeLoads[locale];
  if (loading) return loading;

  const request = fetch(chrome.runtime.getURL(`_locales/${locale}/messages.json`)).then(async (response) => {
    if (!response.ok) throw new Error(`Failed to load ${locale} messages (${response.status})`);
    const value: unknown = await response.json();
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`Invalid ${locale} messages file`);
    for (const entry of Object.values(value)) {
      if (typeof entry !== 'object' || entry === null || !('message' in entry) || typeof entry.message !== 'string') {
        throw new Error(`Invalid message in ${locale} locale`);
      }
    }
    const messages = value as LocaleMessages;
    messagesByLocale[locale] = messages;
    return messages;
  });
  localeLoads[locale] = request;
  void request.catch(() => {
    if (localeLoads[locale] === request) delete localeLoads[locale];
  });
  return request;
}

function setActiveLocale(locale: LocalePreference, messages?: LocaleMessages): void {
  const cached = locale === 'system' ? undefined : messagesByLocale[locale];
  if (locale !== 'system') {
    if (messages) messagesByLocale[locale] = messages;
    if (!messagesByLocale[locale]) throw new Error(`Messages for locale "${locale}" are not loaded.`);
  }
  if (activeLocale === locale && (locale === 'system' || cached === messagesByLocale[locale])) return;
  activeLocale = locale;
  for (const listener of localeListeners) listener();
}
let activationGeneration = 0;

async function activateLocale(locale: LocalePreference): Promise<void> {
  const generation = ++activationGeneration;
  if (locale === 'system') {
    setActiveLocale('system');
    return;
  }
  try {
    const messages = await loadLocaleMessages(locale);
    if (generation === activationGeneration) setActiveLocale(locale, messages);
  } catch (error) {
    if (generation !== activationGeneration) return;
    setActiveLocale('system');
    throw error;
  }
}

let localeSyncTask: Promise<void> | null = null;
let preferenceReadVersion = 0;
let currentPreferenceRead: Promise<void> = Promise.resolve();
let activationVersion = 0;
let currentActivation: Promise<void> = Promise.resolve();
let requestedLocalePreference: LocalePreference | null = null;

function applyLocalePreference(value: unknown): void {
  const preference = resolveLocalePreference(value);
  if (preference === requestedLocalePreference) return;
  requestedLocalePreference = preference;
  activationVersion++;
  currentActivation = activateLocale(preference).catch((error) => {
    if (requestedLocalePreference === preference) requestedLocalePreference = null;
    console.error('[i18n] Could not activate the language preference.', error);
  });
}

function reconcileLocalePreference(): Promise<void> {
  const version = ++preferenceReadVersion;
  const read = localePreference.getValue()
    .then((value) => {
      if (version === preferenceReadVersion) applyLocalePreference(value);
    })
    .catch((error) => {
      if (version !== preferenceReadVersion) return;
      console.error('[i18n] Could not read the language preference.', error);
      applyLocalePreference('system');
    });
  currentPreferenceRead = read;
  return read;
}

async function waitForLocaleActivation(): Promise<void> {
  while (true) {
    const readVersion = preferenceReadVersion;
    const version = activationVersion;
    await currentPreferenceRead;
    await currentActivation;
    if (readVersion === preferenceReadVersion && version === activationVersion) return;
  }
}

function startLocaleSync(): Promise<void> {
  if (localeSyncTask) return localeSyncTask;

  localePreference.watch(() => {
    void reconcileLocalePreference();
  });
  localeSyncTask = (async () => {
    await reconcileLocalePreference();
    await waitForLocaleActivation();
  })();
  return localeSyncTask;
}

async function waitForLocaleSync(): Promise<void> {
  await startLocaleSync();
  // storage 变更通知可能晚于写入完成；后台业务入口再次核对持久化值，避免旧语言输出。
  await reconcileLocalePreference();
  await waitForLocaleActivation();
}

function subscribeLocale(listener: () => void): () => void {
  localeListeners.add(listener);
  return () => localeListeners.delete(listener);
}

function localeSnapshot(): LocalePreference | null {
  return activeLocale;
}

const t = translate as typeof i18n.t;

export {
  activateLocale,
  startLocaleSync,
  waitForLocaleSync,
  setActiveLocale,
  subscribeLocale,
  localeSnapshot,
  t,
};
