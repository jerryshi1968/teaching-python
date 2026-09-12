import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { LANGUAGE_STORAGE_KEY, resolveLanguage, translate } from '../i18n.mjs';

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() => resolveLanguage());
  const setLanguage = useCallback((value) => {
    const next = value === 'en' ? 'en' : 'zh';
    globalThis.localStorage?.setItem(LANGUAGE_STORAGE_KEY, next);
    setLanguageState(next);
  }, []);
  const t = useCallback((key, params) => translate(language, key, params), [language]);
  useEffect(() => {
    document.documentElement.lang = language;
    document.title = language === 'en' ? 'Python Creative Workshop' : 'Python 创意编程乐园';
    document.querySelector('meta[name="description"]')?.setAttribute('content', language === 'en' ? 'Python programming creative workshop' : 'Python 编程创意工坊');
  }, [language]);
  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('useLanguage must be used inside LanguageProvider.');
  return value;
}
