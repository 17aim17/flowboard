import { Navigate, Route, Routes } from 'react-router';
import { useTree } from './api/queries.ts';
import { AppLayout } from './layout/AppLayout.tsx';
import { ListPage } from './list/ListPage.tsx';
import { SettingsPage } from './settings/SettingsPage.tsx';
import { EmptyState } from './shared/states.tsx';

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<FirstList />} />
        <Route path="lists/:listId" element={<ListPage />} />
        <Route path="settings/:containerId" element={<SettingsPage />} />
        <Route path="*" element={<EmptyState title="Page not found" />} />
      </Route>
    </Routes>
  );
}

/** The home page opens the first list the user can see. */
function FirstList() {
  const tree = useTree();
  const first = tree.data?.find((c) => c.type === 'list');
  if (first) return <Navigate to={`/lists/${first.id}`} replace />;
  if (tree.isPending) return null;
  return (
    <EmptyState title="Pick a list on the left">Lists shared with you appear in the sidebar.</EmptyState>
  );
}
