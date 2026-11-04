import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { BoxProvider } from './context/BoxContext';
import './index.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('No se encontró el elemento #root');

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <BoxProvider>
      <App />
    </BoxProvider>
  </React.StrictMode>,
);
