import { AppShell, Button, Group, SegmentedControl, Text, Title } from '@mantine/core';
import { IconSettings } from '@tabler/icons-react';
import { Link, Outlet } from 'react-router';
import { useMe, useTree } from '../api/queries.ts';
import { HANDLES, useCurrentUser } from '../auth/current-user.tsx';
import { Sidebar } from '../sidebar/Sidebar.tsx';

export function AppLayout() {
  return (
    <AppShell header={{ height: 56 }} navbar={{ width: 280, breakpoint: 'sm' }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Title order={4}>Flowboard</Title>
          <Group gap="md">
            <SettingsLink />
            <UserSwitcher />
          </Group>
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

/** Admins only: opens the workspace's settings. Members never see it; the API refuses them anyway. */
function SettingsLink() {
  const me = useMe();
  const workspace = useTree().data?.find((c) => c.type === 'workspace');
  if (me.data?.role !== 'admin' || !workspace) return null;
  return (
    <Button
      component={Link}
      to={`/settings/${workspace.id}`}
      variant="subtle"
      size="xs"
      leftSection={<IconSettings size={14} />}
    >
      Settings
    </Button>
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
