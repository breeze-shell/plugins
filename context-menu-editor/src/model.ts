import { GroupNode, IconSpec, ItemNode, ItemRef, MenuKind, Node, Profile, SepNode } from './types';

let idSeed = 0;

export const newId = (): string => {
    idSeed += 1;
    return `n${idSeed.toString(36)}`;
};

export const originalIcon = (): IconSpec => ({ source: 'original' });

export const itemNode = (ref: ItemRef | null, label: string | null = null, command?: ItemNode['command']): ItemNode => ({
    kind: 'item',
    id: newId(),
    ref,
    command,
    label,
    icon: originalIcon(),
    hidden: false,
    disabled: false
});

export const groupNode = (layout: 'fold' | 'row', label: string): GroupNode => ({
    kind: 'group',
    id: newId(),
    layout,
    label,
    icon: originalIcon(),
    hidden: false,
    children: []
});

export const sepNode = (): SepNode => ({ kind: 'sep', id: newId() });

export const emptyProfile = (kind: MenuKind): Profile => ({
    kind,
    enabled: false,
    nodes: [],
    unmanaged: 'keep-original',
    processFilter: '',
    titleFilter: '',
    updatedAt: 0
});

export const cloneNodes = (nodes: Node[]): Node[] =>
    nodes.map(node => (node.kind === 'group' ? { ...node, icon: { ...node.icon }, children: cloneNodes(node.children) } : { ...node }));

export type Location = { list: Node[]; index: number; parent: GroupNode | null };

export const locate = (nodes: Node[], id: string, parent: GroupNode | null = null): Location | null => {
    for (let index = 0; index < nodes.length; index++) {
        const node = nodes[index];
        if (node.id === id) return { list: nodes, index, parent };
        if (node.kind === 'group') {
            const found = locate(node.children, id, node);
            if (found) return found;
        }
    }
    return null;
};

export const findNode = (nodes: Node[], id: string): Node | null => {
    const found = locate(nodes, id);
    return found ? found.list[found.index] : null;
};

export const nodesOf = (nodes: Node[], parentId: string | null): Node[] => {
    if (parentId === null) return nodes;
    const node = findNode(nodes, parentId);
    return node && node.kind === 'group' ? node.children : [];
};

export const isDescendant = (nodes: Node[], ancestorId: string, id: string): boolean => {
    const ancestor = findNode(nodes, ancestorId);
    if (!ancestor || ancestor.kind !== 'group') return false;
    return locate(ancestor.children, id) !== null;
};

export const removeNode = (nodes: Node[], id: string): { nodes: Node[]; removed: Node | null } => {
    const next = cloneNodes(nodes);
    const found = locate(next, id);
    if (!found) return { nodes, removed: null };
    const [removed] = found.list.splice(found.index, 1);
    return { nodes: next, removed };
};

export const insertNode = (nodes: Node[], node: Node, parentId: string | null, index: number): Node[] => {
    const next = cloneNodes(nodes);
    const list = nodesOf(next, parentId);
    if (!list) return nodes;
    list.splice(clampIndex(index, list.length), 0, node);
    return next;
};

export const updateNode = (nodes: Node[], id: string, patch: (node: Node) => Node): Node[] => {
    const next = cloneNodes(nodes);
    const found = locate(next, id);
    if (!found) return nodes;
    found.list[found.index] = patch(found.list[found.index]);
    return next;
};

export const moveNode = (nodes: Node[], id: string, parentId: string | null, index: number): Node[] => {
    if (id === parentId) return nodes;
    if (parentId !== null && isDescendant(nodes, id, parentId)) return nodes;

    const next = cloneNodes(nodes);
    const from = locate(next, id);
    if (!from) return nodes;

    const targetParent = parentId === null ? null : findNode(next, parentId);
    if (parentId !== null && (!targetParent || targetParent.kind !== 'group')) return nodes;
    const targetList = targetParent && targetParent.kind === 'group' ? targetParent.children : next;

    const [node] = from.list.splice(from.index, 1);
    const sameList = from.list === targetList;
    const at = clampIndex(sameList && from.index < index ? index - 1 : index, targetList.length);
    targetList.splice(at, 0, node);
    return next;
};

export const duplicateNode = (nodes: Node[], id: string): { nodes: Node[]; id: string | null } => {
    const next = cloneNodes(nodes);
    const found = locate(next, id);
    if (!found) return { nodes, id: null };
    const copy = reidentify(found.list[found.index]);
    found.list.splice(found.index + 1, 0, copy);
    return { nodes: next, id: copy.id };
};

export const reidentify = (node: Node): Node => {
    if (node.kind === 'group') {
        return { ...node, id: newId(), icon: { ...node.icon }, children: node.children.map(reidentify) };
    }
    return { ...node, id: newId() };
};

export const wrapInGroup = (nodes: Node[], ids: string[], layout: 'fold' | 'row', label: string): { nodes: Node[]; groupId: string } => {
    const wanted = new Set(ids);
    if (wanted.size === 0) return { nodes, groupId: '' };

    const group = groupNode(layout, label);
    let next = cloneNodes(nodes);
    const pickup = (list: Node[]) => {
        const kept: Node[] = [];
        for (const node of list) {
            if (wanted.has(node.id) && node.kind !== 'group') {
                group.children.push(node);
                continue;
            }
            if (node.kind === 'group') node.children = pickup(node.children);
            kept.push(node);
        }
        return kept;
    };

    const anchor = locate(next, ids[0]);
    const parentId = anchor ? (anchor.parent ? anchor.parent.id : null) : null;
    const index = anchor ? anchor.index : 0;
    const kept = pickup(next);
    if (group.children.length === 0) return { nodes, groupId: '' };

    next = kept;
    const list = nodesOf(next, parentId);
    if (!list) return { nodes, groupId: '' };
    list.splice(clampIndex(index, list.length), 0, group);
    return { nodes: next, groupId: group.id };
};

export const unwrapGroup = (nodes: Node[], id: string): Node[] => {
    const next = cloneNodes(nodes);
    const found = locate(next, id);
    if (!found) return nodes;
    const node = found.list[found.index];
    if (node.kind !== 'group') return nodes;
    found.list.splice(found.index, 1, ...node.children);
    return next;
};

export const flatten = (nodes: Node[], depth = 0): { node: Node; depth: number }[] => {
    const out: { node: Node; depth: number }[] = [];
    for (const node of nodes) {
        out.push({ node, depth });
        if (node.kind === 'group') out.push(...flatten(node.children, depth + 1));
    }
    return out;
};

export const countItems = (nodes: Node[]): number => flatten(nodes).filter(entry => entry.node.kind === 'item').length;

export const clampIndex = (index: number, length: number): number => Math.max(0, Math.min(index, length));
