import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App.tsx';
import { ApiError } from './api/client.ts';
import { CurrentUserProvider } from './auth/current-user.tsx';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      // Retrying won't fix "forbidden", "not found" or "invalid"; it only delays showing the error.
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider>
      <Notifications position="top-right" />
      <QueryClientProvider client={queryClient}>
        <CurrentUserProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </CurrentUserProvider>
      </QueryClientProvider>
    </MantineProvider>
  </StrictMode>,
);
