import { enMessages, type MessageCatalog, type MessageKey } from './messages/en';
import { esMessages } from './messages/es';

const CATALOGS: Record<string, MessageCatalog> = {
  en: enMessages,
  es: esMessages
};

export const SUPPORTED_LANGUAGES = Object.keys(CATALOGS);

export function normalizeLocaleTag(locale: string | null | undefined): string {
  const cleaned = (locale ?? '').trim().replace(/_/g, '-');
  if (!cleaned) {
    return 'en-US';
  }
  try {
    const canonical = Intl.getCanonicalLocales(cleaned)[0];
    return canonical || 'en-US';
  } catch {
    return 'en-US';
  }
}

export function resolveCatalogLanguage(locale: string | null | undefined): string {
  const normalized = normalizeLocaleTag(locale).toLowerCase();
  if (CATALOGS[normalized]) {
    return normalized;
  }
  const base = normalized.split('-')[0];
  if (CATALOGS[base]) {
    return base;
  }
  return 'en';
}

export interface I18nInstance {
  locale: string;
  language: string;
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
  formatDateTime: (isoOrDate: string | Date, style?: 'short' | 'full') => string;
  formatTimeOnly: (isoOrDate: string | Date) => string;
}

export function createI18n(rawLocale: string | null | undefined): I18nInstance {
  const locale = normalizeLocaleTag(rawLocale);
  const language = resolveCatalogLanguage(locale);
  const catalog = CATALOGS[language] ?? enMessages;

  const shortFormatter = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const fullFormatter = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short'
  });

  const timeOnlyFormatter = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  function t(key: MessageKey, params?: Record<string, string | number>): string {
    const template = catalog[key] ?? enMessages[key] ?? key;
    if (!params) {
      return template;
    }
    return template.replace(/\{\{(\w+)\}\}/g, (_match: string, token: string) => {
      const val = params[token];
      return val !== undefined ? String(val) : '';
    });
  }

  function toValidDate(input: string | Date): Date | null {
    const d = input instanceof Date ? input : new Date(input);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function formatDateTime(isoOrDate: string | Date, style: 'short' | 'full' = 'short'): string {
    const date = toValidDate(isoOrDate);
    if (!date) {
      return typeof isoOrDate === 'string' ? isoOrDate : '';
    }
    return style === 'full' ? fullFormatter.format(date) : shortFormatter.format(date);
  }

  function formatTimeOnly(isoOrDate: string | Date): string {
    const date = toValidDate(isoOrDate);
    if (!date) {
      return '';
    }
    return timeOnlyFormatter.format(date);
  }

  return {
    locale,
    language,
    t,
    formatDateTime,
    formatTimeOnly
  };
}
