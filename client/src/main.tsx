import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { HelmetProvider } from 'react-helmet-async';
import { AuthProvider } from '@/app/AuthProvider';
import { queryClient } from '@/app/queryClient';
import { SiteProvider } from '@/app/SiteProvider';
import { ToastProvider } from '@/components/ui/Toast';
import App from './App';
import './styles/index.css';

if (!window.location.pathname.startsWith('/admin')) document.body.classList.add('site');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <SiteProvider>
          <AuthProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </AuthProvider>
        </SiteProvider>
      </QueryClientProvider>
    </HelmetProvider>
  </React.StrictMode>,
);
