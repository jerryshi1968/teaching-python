import { useLanguage } from './LanguageContext.jsx';

export default function LanguageSelect() {
  const { language, setLanguage } = useLanguage();
  return <label className="language-select"><span aria-hidden="true">⚑</span><span>语言</span><select aria-label="Language" value={language} onChange={(event) => setLanguage(event.target.value)}><option value="zh">中文</option><option value="en">English</option></select></label>;
}
