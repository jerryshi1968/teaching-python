export const LANGUAGE_STORAGE_KEY = 'python:language';

export const messages = {
  zh: { workspace: '我的创意工坊', createProject: '新建作品', createGroup: '新建作品组', save: '保存', run: '运行', stop: '停止' },
  en: { workspace: 'My Creative Studio', createProject: 'New project', createGroup: 'New group', save: 'Save', run: 'Run', stop: 'Stop' }
};

export function resolveLanguage(storage = globalThis.localStorage) {
  const saved = storage?.getItem(LANGUAGE_STORAGE_KEY);
  return saved === 'en' || saved === 'zh' ? saved : 'zh';
}

export function translate(language, key, params = {}) {
  const template = messages[language]?.[key] ?? messages.zh[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ''));
}
