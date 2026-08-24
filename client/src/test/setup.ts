// Keep this first — see the comment inside. Later imports (i18n/config)
// touch localStorage at module scope and need the bridge already in place.
import './polyfill-storage';
import '@testing-library/jest-dom/vitest';
import i18n from 'i18next';
import '../i18n/config';

// Force English in the test environment. The i18n config defaults to PT-BR
// for non-Spanish detected locales (Brazilian-first product behavior); test
// assertions are written against English strings. Without this, jsdom renders
// the PT-BR bundle and every test asserting localized UI fails.
i18n.changeLanguage('en');
