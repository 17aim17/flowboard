import { AppShell, Group, SegmentedControl, Text, Title } from '@mantine/core';
import { Outlet } from 'react-router';
import { HANDLES, useCurrentUser } from '../auth/current-user.tsx';
import { Sidebar } from '../sidebar/Sidebar.tsx';

export function AppLayout() {
  return (
    <AppShell header={{ height: 56 }} navbar={{ width: 280, breakpoint: 'sm' }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Title order={4}>Flowboard</Title>
          <UserSwitcher />
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="xs">
        <Sidebar />
      </AppShell.Navbar>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}

/** Mock login: switching users changes the X-User-Id header and clears cached data. */
function UserSwitcher() {
  const { handle, switchUser } = useCurrentUser();
  return (
    <Group gap="xs">
      <Text size="sm" c="dimmed" id="user-switcher-label">
        Signed in as
      </Text>
      <SegmentedControl
        aria-labelledby="user-switcher-label"
        size="xs"
        value={handle}
        onChange={(value) => switchUser(value)}
        data={HANDLES.map((h) => ({ value: h, label: h[0]!.toUpperCase() + h.slice(1) }))}
      />
    </Group>
  );
}
