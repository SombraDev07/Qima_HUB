import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './auth.jsx';
import { Analytics } from '@vercel/analytics/react';
import App from './App.jsx';
import { DialogProvider } from './shared/dialogo.jsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <DialogProvider>
          <App />
          {/* Vercel Analytics: contagem de visitas e páginas (só age quando publicado na Vercel) */}
          <Analytics />
        </DialogProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
