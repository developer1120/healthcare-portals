import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/outfit';
import '@fontsource-variable/figtree';
import './styles/index.css';
import { App } from './App';

const container = document.getElementById('root');
if (!container) throw new Error('Mendwell could not find the #root element in index.html.');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
