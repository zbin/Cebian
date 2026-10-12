import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { localePreference } from '@/lib/persistence/storage';
import {
  localeSnapshot,
  setActiveLocale,
  startLocaleSync,
  subscribeLocale,
  t,
  waitForLocaleSync,
} from '@/lib/i18n';

afterEach(() => {
  setActiveLocale('system');
  vi.unstubAllGlobals();
});
it('stays uninitialized until a locale is activated', () => {
  expect(localeSnapshot()).toBeNull();
});
  it('announces immediate locale changes to subscribers and reuses a cached catalog', () => {
    const updates: Array<string | null> = [];
    const unsubscribe = subscribeLocale(() => updates.push(localeSnapshot()));
    setActiveLocale('en', { common_send: { message: 'Send' } });
    setActiveLocale('system');
    setActiveLocale('en');
    unsubscribe();

    expect(updates).toEqual(['en', 'system', 'en']);
    expect(t('common.send')).toBe('Send');
  });

describe('locale-aware t', () => {
  it('selects zero, one, and many plural forms and substitutes the count', () => {
    setActiveLocale('en', {
      common_session_messageCount: { message: 'No messages | One message | $1 messages' },
    });

    expect(t('common.session.messageCount', 0)).toBe('No messages');
    expect(t('common.session.messageCount', 1)).toBe('One message');
    expect(t('common.session.messageCount', 6)).toBe('6 messages');
  });

  it('selects one-or-many plural forms and honors an explicit substitution', () => {
    setActiveLocale('zh_CN', {
      common_selectedCount: { message: '已选 1 项 | 已选 $1 项' },
    });

    expect(t('common.selectedCount', 1)).toBe('已选 1 项');
    expect(t('common.selectedCount', 4, ['四'])).toBe('已选 四 项');
  });
  it('does not parse plural separators inside caller substitutions', () => {
    setActiveLocale('zh_CN', {
      common_selectedCount: { message: '已选 1 项 | 已选 $1 项' },
    });

    expect(t('common.selectedCount', 4, ['甲 | 乙'])).toBe('已选 甲 | 乙 项');
  });

  it('applies Chrome dollar escaping without reinterpreting replacement text', () => {
    setActiveLocale('en', {
      common_time_minutesAgo: { message: 'Cost $$1; elapsed $1 min ago' },
    });

    expect(t('common.time.minutesAgo', ['$9'])).toBe('Cost $1; elapsed $9 min ago');
  });
  it('removes positional placeholders absent from the caller substitutions', () => {
    setActiveLocale('en', {
      common_send: { message: 'Send $1' },
    });

    expect(t('common.send')).toBe('Send ');
  });

  it('rejects activating an explicit locale before its message catalog is loaded', () => {
    expect(() => setActiveLocale('zh_TW')).toThrow('Messages for locale "zh_TW" are not loaded.');
    expect(localeSnapshot()).toBe('system');
  });
});

it('preserves the preference on catalog failure and waits for later locale activation', async () => {
  fakeBrowser.reset();
  vi.stubGlobal('chrome', {
    runtime: { getURL: (path: string) => `chrome-extension://test/${path}` },
  });
  let zhTwLoads = 0;
  let pendingZhTwCatalog: Promise<Response> | null = null;
  let resolveZhTwCatalog!: (response: Response) => void;
  const fetchLocale = vi.fn(async (input: string | URL) => {
    if (String(input).includes('/zh_TW/')) {
      zhTwLoads++;
      if (zhTwLoads === 1) return new Response(null, { status: 503 });
      if (!pendingZhTwCatalog) throw new Error('Missing deferred locale catalog.');
      return pendingZhTwCatalog;
    }
    return new Response(JSON.stringify({ common_send: { message: 'Send' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchLocale);

  await localePreference.setValue('zh_TW');
  await startLocaleSync();
  expect(localeSnapshot()).toBe('system');
  expect(await localePreference.getValue()).toBe('zh_TW');

  pendingZhTwCatalog = new Promise<Response>((resolve) => {
    resolveZhTwCatalog = resolve;
  });
  let settled = false;
  const localeReady = waitForLocaleSync().then(() => {
    settled = true;
  });
  await vi.waitFor(() => expect(zhTwLoads).toBe(2));
  await Promise.resolve();
  expect(settled).toBe(false);

  await localePreference.setValue('zh_CN');
  await vi.waitFor(() => expect(localeSnapshot()).toBe('zh_CN'));

  resolveZhTwCatalog(
    new Response(JSON.stringify({ common_send: { message: '傳送' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
  await localeReady;
  expect(localeSnapshot()).toBe('zh_CN');
  expect(t('common.selectedCount', 1)).toBe('已选 1 项');
});
