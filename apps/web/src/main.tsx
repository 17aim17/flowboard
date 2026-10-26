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

// 502-504 means the API is starting (a sleeping free-plan host takes up to a minute to wake).
const isWaking = (error: Error) => error instanceof ApiError && error.status >= 502 && error.status <= 504;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      // Retrying won't fix "forbidden", "not found" or "invalid"; it only delays showing the error.
      // A waking API is retried every 5 seconds for 90 seconds, and the page keeps its loading state.
      retry: (count, error) =>
        isWaking(error) ? count < 18 : !(error instanceof ApiError && error.status < 500) && count < 2,
      retryDelay: (count, error) => (isWaking(error) ? 5_000 : Math.min(1_000 * 2 ** count, 30_000)),
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
