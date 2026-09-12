import { createRoot } from 'react-dom/client';
import '@tigao/organizer-react/styles.css';
import './styles.css';
import './organizer-overrides.css';
import App from './App.jsx';
import { LanguageProvider } from './i18n/LanguageContext.jsx';

createRoot(document.getElementById('root')).render(<LanguageProvider><App /></LanguageProvider>);
