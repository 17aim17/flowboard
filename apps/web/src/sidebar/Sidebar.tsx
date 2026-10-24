import { NavLink, ScrollArea, Text } from '@mantine/core';
import { IconFolder, IconLayoutKanban, IconLock, IconStack2 } from '@tabler/icons-react';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { useTree } from '../api/queries.ts';
import { EmptyState, ErrorState, LoadingState } from '../shared/states.tsx';
import { buildTree, type TreeNode } from './tree.ts';

const icons = { space: IconStack2, folder: IconFolder, list: IconLayoutKanban } as const;

/** Collapsible workspace tree. Only containers the current user can see come back from the API. */
export function Sidebar() {
  const tree = useTree();
  const roots = useMemo(() => buildTree(tree.data ?? []), [tree.data]);

  if (tree.isPending) return <LoadingState rows={6} />;
  if (tree.isError) return <ErrorState error={tree.error} onRetry={() => void tree.refetch()} />;

  const workspace = roots[0];
  if (!workspace || workspace.children.length === 0) {
    return <EmptyState title="Nothing shared with you yet" />;
  }
  return (
    <ScrollArea>
      <Text size="xs" fw={700} c="dimmed" tt="uppercase" px="sm" pb="xs">
        {workspace.name}
      </Text>
      <nav aria-label="Workspace">
        {workspace.children.map((node) => (
          <TreeItem key={node.id} node={node} />
        ))}
      </nav>
    </ScrollArea>
  );
}

function TreeItem({ node }: { node: TreeNode }) {
  const { listId } = useParams();
  const Icon = icons[node.type as keyof typeof icons];
  const label = (
    <>
      {node.name}
      {node.visibility === 'private' && <IconLock size={12} style={{ marginLeft: 6 }} aria-label="private" />}
    </>
  );

  if (node.type === 'list') {
    return (
      <NavLink
        component={Link}
        to={`/lists/${node.id}`}
        label={label}
        leftSection={<Icon size={16} />}
        active={node.id === listId}
      />
    );
  }
  return (
    <NavLink label={label} leftSection={<Icon size={16} />} defaultOpened childrenOffset="md">
      {node.children.map((child) => (
        <TreeItem key={child.id} node={child} />
      ))}
    </NavLink>
  );
}
