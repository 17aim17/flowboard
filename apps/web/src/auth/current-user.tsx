import { useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useCallback, useContext, useState } from 'react';

// Mock login: the chosen user is remembered in localStorage and sent as X-User-Id on every request.

export const HANDLES = ['alice', 'bob', 'carol'] as const;
export type Handle = (typeof HANDLES)[number];

const STORAGE_KEY = 'flowboard.user';

export function getCurrentUser(): Handle {
  const stored = localStorage.getItem(STORAGE_KEY);
  return HANDLES.includes(stored as Handle) ? (stored as Handle) : 'alice';
}

const CurrentUserContext = createContext<{ handle: Handle; switchUser: (handle: Handle) => void } | null>(
  null,
);

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [handle, setHandle] = useState(getCurrentUser);

  const switchUser = useCallback(
    (next: Handle) => {
      localStorage.setItem(STORAGE_KEY, next);
      queryClient.clear(); // never show one user's cached data to another
      setHandle(next);
    },
    [queryClient],
  );

  return <CurrentUserContext value={{ handle, switchUser }}>{children}</CurrentUserContext>;
}

export function useCurrentUser() {
  const context = useContext(CurrentUserContext);
  if (!context) throw new Error('useCurrentUser must be used inside CurrentUserProvider');
  return context;
}
