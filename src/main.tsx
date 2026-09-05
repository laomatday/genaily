import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App, { ErrorBoundary } from './App';
import { ThemeProvider } from './hooks/useTheme';
import './style.css';
import './native/native.css';

const root = document.getElementById('root');
if (!root) throw new Error('Không tìm thấy phần tử #root.');

createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </ThemeProvider>
  </StrictMode>,
);
