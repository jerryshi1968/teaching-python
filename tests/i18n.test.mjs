import assert from 'node:assert/strict';
import test from 'node:test';
import { LANGUAGE_STORAGE_KEY, resolveLanguage, translate } from '../frontend/src/i18n.mjs';

test('Python language state is independent and defaults to Chinese', () => {
  const values = new Map([['cpp:language', 'en'], ['teaching_language', 'en']]);
  const storage = { getItem: (key) => values.get(key) ?? null };
  assert.equal(resolveLanguage(storage), 'zh');
  values.set(LANGUAGE_STORAGE_KEY, 'en');
  assert.equal(resolveLanguage(storage), 'en');
  assert.equal(translate('en', 'save'), 'Save');
});
