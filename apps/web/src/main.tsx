import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { CrashCard } from './ui/CrashCard';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { I18nProvider } from './i18n/I18nProvider';
import './styles.css';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('Missing #root element');
}
createRoot(container).render(
  <StrictMode>
    <I18nProvider>
      <ErrorBoundary fallback={<CrashCard />}>
        <App />
      </ErrorBoundary>
    </I18nProvider>
  </StrictMode>,
);
