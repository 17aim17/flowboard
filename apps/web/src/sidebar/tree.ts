import type { Container } from '@flowboard/contracts';

export type TreeNode = Container & { children: TreeNode[] };

/** Nests the flat /tree response by parentId. The API returns siblings in order. */
export function buildTree(containers: Container[]): TreeNode[] {
  const nodes = new Map(containers.map((c) => [c.id, { ...c, children: [] as TreeNode[] }]));
  const roots: TreeNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

/** Names from the workspace down to a container, for breadcrumbs. */
export function pathTo(containers: Container[], id: string): Container[] {
  const byId = new Map(containers.map((c) => [c.id, c]));
  const path: Container[] = [];
  for (let node = byId.get(id); node; node = node.parentId ? byId.get(node.parentId) : undefined) {
    path.unshift(node);
  }
  return path;
}
