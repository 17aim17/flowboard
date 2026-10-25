import { Group, Select, Stack, Tabs, Text, Title } from '@mantine/core';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useMe, useTree } from '../api/queries.ts';
import { pathTo } from '../sidebar/tree.ts';
import { EmptyState, ErrorState, LoadingState } from '../shared/states.tsx';
import { FieldSettings } from './FieldSettings.tsx';
import { StatusSettings } from './StatusSettings.tsx';

const typeLabel = { workspace: 'Workspace', space: 'Space', folder: 'Folder', list: 'List' };

/**
 * Statuses and custom fields of one container (workspace, space, folder or list). Admin-only, as on
 * the server (decision D-13). The container and tab live in the URL: /settings/<id>?tab=fields.
 */
export function SettingsPage() {
  const { containerId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const me = useMe();
  const tree = useTree();

  if (me.isPending || tree.isPending) return <LoadingState rows={6} />;
  if (me.isError || tree.isError) return <ErrorState error={me.error ?? tree.error} />;
  if (me.data.role !== 'admin')
    return (
      <EmptyState title="Only admins can change settings">
        Ask an admin to change statuses or fields.
      </EmptyState>
    );

  const container = tree.data.find((c) => c.id === containerId);
  if (!container) return <EmptyState title="Not found">It may have been archived.</EmptyState>;

  const nameOf = (id: string) => tree.data.find((c) => c.id === id)?.name ?? 'an archived container';
  const levels = tree.data.map((c) => ({
    value: c.id,
    label: `${c.name} (${typeLabel[c.type].toLowerCase()})`,
  }));
  const depth = new Map(tree.data.map((c) => [c.id, pathTo(tree.data, c.id).length - 1]));
  const tab = params.get('tab') === 'fields' ? 'fields' : 'statuses';

  return (
    <Stack gap="md" maw={960}>
      <Group justify="space-between" align="flex-end">
        <div>
          <Text size="xs" c="dimmed">
            {typeLabel[container.type]} settings
          </Text>
          <Title order={2}>{container.name}</Title>
        </div>
        <Select
          label="Level"
          w={280}
          data={levels}
          value={containerId}
          allowDeselect={false}
          searchable
          renderOption={({ option }) => (
            <Text size="sm" pl={(depth.get(option.value) ?? 0) * 12}>
              {option.label}
            </Text>
          )}
          onChange={(id) => id && void navigate(`/settings/${id}${tab === 'fields' ? '?tab=fields' : ''}`)}
        />
      </Group>

      <Tabs value={tab} onChange={(next) => setParams(next === 'fields' ? { tab: 'fields' } : {})}>
        <Tabs.List>
          <Tabs.Tab value="statuses">Statuses</Tabs.Tab>
          <Tabs.Tab value="fields">Custom fields</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="statuses" pt="md">
          <StatusSettings
            key={containerId}
            containerId={containerId}
            isList={container.type === 'list'}
            nameOf={nameOf}
          />
        </Tabs.Panel>
        <Tabs.Panel value="fields" pt="md">
          {container.type === 'workspace' ? (
            <EmptyState title="Custom fields start at the space level">
              Pick a space, folder or list to add fields.
            </EmptyState>
          ) : (
            <FieldSettings key={containerId} containerId={containerId} nameOf={nameOf} />
          )}
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
