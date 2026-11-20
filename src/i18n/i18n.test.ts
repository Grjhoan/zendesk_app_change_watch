import { describe, expect, it } from 'vitest';
import { createI18n, resolveCatalogLanguage } from './index';
import { enMessages } from './messages/en';
import { esMessages } from './messages/es';

describe('i18n localization', () => {
  it('keeps en and es message catalogs in full key parity', () => {
    expect(Object.keys(esMessages).sort()).toEqual(Object.keys(enMessages).sort());
  });

  it('resolves regional locales to matching language catalogs and formats dates via Intl.DateTimeFormat', () => {
    expect(resolveCatalogLanguage('es-419')).toBe('es');
    expect(resolveCatalogLanguage('es-ES')).toBe('es');
    expect(resolveCatalogLanguage('en-GB')).toBe('en');
    expect(resolveCatalogLanguage('fr-FR')).toBe('en');

    const esI18n = createI18n('es-419');
    expect(esI18n.t('tabs.activity')).toBe('Actividad');
    expect(esI18n.t('alerts.unreadCount', { count: 3 })).toBe('3 sin leer');

    const formatted = esI18n.formatDateTime('2026-11-19T18:30:00Z', 'short');
    expect(formatted).toContain('2026');
  });
});
