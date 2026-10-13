import * as shell from 'mshell';
import { ItemNode, ItemRef, MenuKind, Node, Profile, Snapshot, SnapshotItem, UnmanagedPolicy } from './types';
import { isDescendant, itemNode, reidentify } from './model';
import { menuIcon } from './theme';

export type CapturedItem = {
    key: string;
    index: number;
    controller: shell.menu_item_controller;
    data: shell.js_menu_data;
    name: string;
    originName?: string;
    nameResid?: string;
    wID?: number;
    hotkey?: string;
    disabled: boolean;
    separator: boolean;
    hasSubmenu: boolean;
};

export type PlanNode =
    | {
          kind: 'item';
          source: CapturedItem | null;
          label: string | null;
          icon: ItemNode['icon'];
          disabled: boolean;
          command?: ItemNode['command'];
      }
    | { kind: 'group'; layout: 'fold' | 'row'; label: string; icon: ItemNode['icon']; children: PlanNode[] }
    | { kind: 'sep' };

export type MenuContextInfo = {
    kind: MenuKind;
    path: string;
    selected: string[];
    selection: number;
    title: string;
    className: string;
    executable: string;
};

export type PlanWarningKind = 'empty-group' | 'unknown-ref' | 'ignored-in-row' | 'dead-separator';

export type PlanWarning = { id: string; kind: PlanWarningKind };

const baseKeyOf = (nameResid?: string, originName?: string, name?: string): string => {
    if (nameResid) return `r:${nameResid}`;
    if (originName) return `o:${originName}`;
    return `n:${name ?? ''}`;
};

const DESKTOP_WINDOW = /^(Progman|WorkerW)$/i;
const SHELL_VIEW = /^(SysListView32|SHELLDLL_DefView)$/i;
const TASKBAR_WINDOW = /^Shell_(Secondary)?TrayWnd$/i;

const comparablePath = (path: string) => path.replace(/[\\/]+$/, '').toLowerCase();

export const desktopPaths = (): string[] =>
    ['USERPROFILE', 'OneDrive', 'OneDriveConsumer', 'OneDriveCommercial']
        .map(name => shell.win32.env(name))
        .filter((base): base is string => typeof base === 'string' && base.length > 0)
        .map(base => comparablePath(`${base}\\Desktop`));

export const classifyMenu = (context: shell.js_menu_context, desktops: string[] = desktopPaths()): MenuContextInfo => {
    const windowInfo = context.window_info;
    const folderView = context.folder_view;
    const selected = folderView?.selected_files ?? [];
    const info = {
        path: folderView?.current_path ?? '',
        selected,
        selection: selected.length,
        title: windowInfo?.title ?? '',
        className: windowInfo?.class_name ?? '',
        executable: windowInfo?.executable_path ?? ''
    };

    const onDesktop =
        DESKTOP_WINDOW.test(info.className) || (SHELL_VIEW.test(info.className) && (!folderView || desktops.includes(comparablePath(info.path))));
    if (onDesktop) return { ...info, kind: 'desktop' };
    if (folderView) return { ...info, kind: selected.length > 0 ? 'files' : 'folder' };
    if (TASKBAR_WINDOW.test(info.className)) return { ...info, kind: 'taskbar' };
    return { ...info, kind: 'other' };
};

const quoted = (path: string) => (/\s/.test(path) ? `"${path}"` : path);

export const expandArgs = (args: string, info: MenuContextInfo): string => {
    const targets = info.selected.length > 0 ? info.selected : info.path ? [info.path] : [];
    return args.replace(/%(PATH|FOLDER)%/gi, (_, name: string) =>
        name.toUpperCase() === 'FOLDER' ? (info.path ? quoted(info.path) : '') : targets.map(quoted).join(' ')
    );
};

export const matchesProfileContext = (profile: Profile, info: MenuContextInfo): boolean => {
    if (info.kind !== 'other') return true;

    const processes = profile.processFilter
        .split(',')
        .map(entry => entry.trim().toLowerCase())
        .filter(entry => entry.length > 0);
    if (processes.length > 0) {
        const executable = info.executable.split(/[\\/]/).pop()?.toLowerCase() ?? '';
        if (!processes.includes(executable)) return false;
    }

    const title = profile.titleFilter.trim().toLowerCase();
    return title.length === 0 || info.title.toLowerCase().includes(title);
};

export const captureMenu = (menu: shell.menu_controller): CapturedItem[] => {
    const out: CapturedItem[] = [];
    const counts = new Map<string, number>();
    let index = 0;

    for (const controller of menu.items) {
        const data = controller.data();
        if (!data) continue;

        const base = baseKeyOf(data.name_resid, data.origin_name, data.name);
        const seen = counts.get(base) ?? 0;
        counts.set(base, seen + 1);

        out.push({
            key: seen === 0 ? base : `${base}#${seen}`,
            index,
            controller,
            data,
            name: data.name ?? '',
            originName: data.origin_name,
            nameResid: data.name_resid,
            wID: data.wID,
            hotkey: data.hotkey,
            disabled: data.disabled === true,
            separator: data.type === 'spacer',
            hasSubmenu: typeof data.submenu === 'function'
        });
        index += 1;
    }

    return out;
};

export const makeSnapshot = (items: CapturedItem[], info: MenuContextInfo): Snapshot => ({
    at: Date.now(),
    kind: info.kind,
    windowTitle: info.title,
    className: info.className,
    executable: info.executable,
    path: info.path,
    selection: info.selection,
    items: items.map(
        (item): SnapshotItem => ({
            key: item.key,
            name: item.name,
            originName: item.originName,
            nameResid: item.nameResid,
            wID: item.wID,
            hotkey: item.hotkey,
            disabled: item.disabled,
            hasSubmenu: item.hasSubmenu,
            separator: item.separator,
            iconSvg: typeof item.data.icon_svg === 'string' ? item.data.icon_svg : undefined,
            hasIconBitmap: typeof item.data.icon_bitmap === 'number'
        })
    )
});

export const refFromSnapshotItem = (item: SnapshotItem): ItemRef => ({
    key: item.key,
    name: item.name,
    originName: item.originName,
    nameResid: item.nameResid,
    wID: item.wID,
    hotkey: item.hotkey,
    hasSubmenu: item.hasSubmenu
});

export const nodeFromSnapshotItem = (item: SnapshotItem): ItemNode => itemNode(refFromSnapshotItem(item), null);

export const nodesFromSnapshot = (snapshot: Snapshot): Node[] =>
    snapshot.items.filter(item => !item.separator).map(nodeFromSnapshotItem);

export type CanvasRow = {
    key: string;
    node: Node;
    virtual: boolean;
    parentId: string | null;
    index: number;
    depth: number;
    hiddenByPolicy: boolean;
};

const snapshotIndexOf = (snapshot: Snapshot | null, key: string): number => {
    if (!snapshot) return -1;
    return snapshot.items.findIndex(item => item.key === key);
};

export const buildCanvas = (profile: Profile, snapshot: Snapshot | null, expanded: string[]): CanvasRow[] => {
    const managed = new Set<string>();
    const walkManaged = (nodes: Node[]) => {
        for (const node of nodes) {
            if (node.kind === 'group') walkManaged(node.children);
            else if (node.kind === 'item' && node.ref) managed.add(node.ref.key);
        }
    };
    walkManaged(profile.nodes);

    const rowOf = (node: Node, parentId: string | null, index: number, depth: number): CanvasRow => ({
        key: node.id,
        node,
        virtual: false,
        parentId,
        index,
        depth,
        hiddenByPolicy: false
    });

    const virtualRows: CanvasRow[] = (snapshot?.items ?? [])
        .filter(item => !item.separator && !managed.has(item.key))
        .map(item => ({
            key: `virtual:${item.key}`,
            node: nodeFromSnapshotItem(item),
            virtual: true,
            parentId: null,
            index: -1,
            depth: 0,
            hiddenByPolicy: false
        }));

    const rows: CanvasRow[] = [];
    const walk = (nodes: Node[], parentId: string | null, depth: number) => {
        nodes.forEach((node, index) => {
            rows.push(rowOf(node, parentId, index, depth));
            if (node.kind === 'group' && expanded.includes(node.id)) walk(node.children, node.id, depth + 1);
        });
    };

    if (profile.unmanaged !== 'keep-original') {
        walk(profile.nodes, null, 0);
        return rows.concat(virtualRows.map(row => ({ ...row, hiddenByPolicy: profile.unmanaged === 'hide' })));
    }

    const sources = sourcesOf(snapshotSources(snapshot));
    const pending = virtualRows.slice();
    const flushBefore = (anchorIndex: number) => {
        const take: CanvasRow[] = [];
        for (let i = 0; i < pending.length; ) {
            const index = snapshotIndexOf(snapshot, pending[i].key.slice('virtual:'.length));
            if (index >= 0 && index < anchorIndex) {
                take.push(pending[i]);
                pending.splice(i, 1);
            } else i += 1;
        }
        rows.push(...take);
    };

    const walkOrdered = (nodes: Node[], parentId: string | null, depth: number) => {
        nodes.forEach((node, index) => {
            if (parentId === null) {
                const planned = planNodeOf(node, sources, new Set());
                const anchor = planned ? firstSourceIndex(planned) : null;
                if (anchor !== null) flushBefore(anchor);
            }
            rows.push(rowOf(node, parentId, index, depth));
            if (node.kind === 'group' && expanded.includes(node.id)) walkOrdered(node.children, node.id, depth + 1);
        });
    };
    walkOrdered(profile.nodes, null, 0);
    return rows.concat(pending);
};

export type DropAnchor = { parentId: string | null; index: number; virtual: boolean };

// 松手后什么都不会变的落点: 自己所在的那两个槽位, 以及自己/自己的后代当容器
export const isNoopDrop = (source: DropAnchor & { key: string }, nodes: Node[], parentId: string | null, index: number): boolean => {
    if (source.virtual || parentId === '__trash') return false;
    if (parentId === source.key) return true;
    if (parentId !== null && isDescendant(nodes, source.key, parentId)) return true;
    return parentId === source.parentId && (index === source.index || index === source.index + 1);
};

export type DropSlot = { at: number; index: number };

// 插入提示只贴在真实行旁边: 第一个真实行的上方, 以及每个真实行的下方。
// 未纳入的原生行位置由原生顺序决定, 提示画在它们中间会指着一个落不到的地方。
export const dropSlots = (level: { virtual: boolean; index: number }[]): DropSlot[] => {
    const real = level.map((row, at) => ({ row, at })).filter(entry => !entry.row.virtual);
    if (real.length === 0) return [];
    return [{ at: real[0].at, index: 0 }, ...real.map(entry => ({ at: entry.at + 1, index: entry.row.index + 1 }))];
};

export const adoptUnmanaged = (profile: Profile, snapshot: Snapshot | null): { nodes: Node[]; added: number } => {
    const rows = buildCanvas(profile, snapshot, []);
    const nodes = profile.nodes.slice();
    let at = nodes.length;
    let added = 0;
    for (let i = rows.length - 1; i >= 0; i -= 1) {
        const row = rows[i];
        if (!row.virtual) {
            at = row.index;
            continue;
        }
        const node = reidentify(row.node);
        nodes.splice(at, 0, row.hiddenByPolicy && node.kind !== 'sep' ? { ...node, hidden: true } : node);
        added += 1;
    }
    return { nodes, added };
};

const markConsumed = (node: Node, sources: Map<string, CapturedItem>, used: Set<string>) => {
    if (node.kind === 'group') {
        for (const child of node.children) markConsumed(child, sources, used);
        return;
    }
    if (node.kind === 'item' && node.ref) {
        const source = sources.get(node.ref.key);
        if (source) used.add(source.key);
    }
};

type Drop = { id: string; kind: PlanWarningKind };

type Traced = { node: PlanNode; id: string | null };

const tidyTraced = (traced: Traced[], drops?: Drop[]): Traced[] => {
    const dead = (entry: Traced) => {
        if (entry.id) drops?.push({ id: entry.id, kind: 'dead-separator' });
    };
    const kept: Traced[] = [];
    for (const entry of traced) {
        if (entry.node.kind === 'sep' && (kept.length === 0 || kept[kept.length - 1].node.kind === 'sep')) {
            dead(entry);
            continue;
        }
        kept.push(entry);
    }
    while (kept.length > 0 && kept[kept.length - 1].node.kind === 'sep') dead(kept.pop() as Traced);
    return kept;
};

export const tidyPlan = (plan: PlanNode[]): PlanNode[] => tidyTraced(plan.map(node => ({ node, id: null }))).map(entry => entry.node);

const planNodeOf = (node: Node, sources: Map<string, CapturedItem>, used: Set<string>, drops?: Drop[]): PlanNode | null => {
    if (node.kind !== 'sep' && node.hidden) {
        // 隐藏的节点整个丢掉, 同时把它吃掉的原生项标记掉, 免得被当成"未列项"捡回来
        markConsumed(node, sources, used);
        return null;
    }

    if (node.kind === 'sep') return { kind: 'sep' };

    if (node.kind === 'group') {
        const traced: Traced[] = [];
        for (const child of node.children) {
            if (node.layout === 'row' && child.kind === 'group' && !child.hidden) {
                markConsumed(child, sources, used);
                drops?.push({ id: child.id, kind: 'ignored-in-row' });
                continue;
            }
            const planned = planNodeOf(child, sources, used, drops);
            if (planned) traced.push({ node: planned, id: child.id });
        }
        const children = tidyTraced(traced, drops).map(entry => entry.node);
        if (children.length === 0) {
            drops?.push({ id: node.id, kind: 'empty-group' });
            return null;
        }
        return { kind: 'group', layout: node.layout, label: node.label, icon: node.icon, children };
    }

    const source = node.ref ? sources.get(node.ref.key) ?? null : null;
    if (!source && !node.command) {
        drops?.push({ id: node.id, kind: 'unknown-ref' });
        return null;
    }
    if (source) used.add(source.key);

    return { kind: 'item', source, label: node.label, icon: node.icon, disabled: node.disabled, command: node.command };
};

const passthrough = (item: CapturedItem): PlanNode =>
    item.separator ? { kind: 'sep' } : { kind: 'item', source: item, label: null, icon: { source: 'original' }, disabled: false };

const firstSourceIndex = (node: PlanNode): number | null => {
    if (node.kind === 'item') return node.source ? node.source.index : null;
    if (node.kind === 'group') {
        let best: number | null = null;
        for (const child of node.children) {
            const index = firstSourceIndex(child);
            if (index !== null && (best === null || index < best)) best = index;
        }
        return best;
    }
    return null;
};

const sourcesOf = (captured: CapturedItem[]): Map<string, CapturedItem> => {
    const sources = new Map<string, CapturedItem>();
    for (const item of captured) if (!item.separator) sources.set(item.key, item);
    return sources;
};

const placeLeftovers = (traced: Traced[], leftovers: CapturedItem[], policy: UnmanagedPolicy): Traced[] => {
    if (policy === 'hide') return traced;
    const out = traced.slice();
    if (policy === 'keep-end') return out.concat(leftovers.map(item => ({ node: passthrough(item), id: null })));

    for (const item of leftovers) {
        let position = out.length;
        for (let i = 0; i < out.length; i++) {
            const index = firstSourceIndex(out[i].node);
            if (index !== null && index > item.index) {
                position = i;
                break;
            }
        }
        out.splice(position, 0, { node: passthrough(item), id: null });
    }
    return out;
};

const planTraced = (captured: CapturedItem[], profile: Profile, drops?: Drop[]): Traced[] => {
    const sources = sourcesOf(captured);
    const used = new Set<string>();
    const traced: Traced[] = [];
    for (const node of profile.nodes) {
        const planned = planNodeOf(node, sources, used, drops);
        if (planned) traced.push({ node: planned, id: node.id });
    }
    const leftovers = captured.filter(item => item.separator || !used.has(item.key));
    return tidyTraced(placeLeftovers(traced, leftovers, profile.unmanaged), drops);
};

export const planMenu = (captured: CapturedItem[], profile: Profile): PlanNode[] => planTraced(captured, profile).map(entry => entry.node);

const snapshotSources = (snapshot: Snapshot | null): CapturedItem[] =>
    (snapshot?.items ?? []).map((item, index) => ({
        key: item.key,
        index,
        controller: null as unknown as shell.menu_item_controller,
        data: {} as shell.js_menu_data,
        name: item.name,
        originName: item.originName,
        nameResid: item.nameResid,
        wID: item.wID,
        hotkey: item.hotkey,
        disabled: item.disabled,
        separator: item.separator,
        hasSubmenu: item.hasSubmenu
    }));

export const analysePlan = (profile: Profile, snapshot: Snapshot | null): PlanWarning[] => {
    const drops: Drop[] = [];
    planTraced(snapshotSources(snapshot), profile, drops);
    return drops;
};

const resolveIconSvg = (icon: ItemNode['icon']): string | null => (icon.source === 'svg' ? menuIcon(icon.svg) : null);

const applyIcon = (data: shell.js_menu_data, icon: ItemNode['icon']) => {
    if (icon.source === 'original') {
        return;
    }

    const reset = new shell.value_reset();
    const svg = resolveIconSvg(icon);
    if (svg === null) {
        data.icon_svg = reset;
        data.icon_bitmap = reset;
        return;
    }

    data.icon_svg = svg;
    data.icon_bitmap = reset;
};

const customAction = (command: NonNullable<ItemNode['command']>, menu: shell.menu_controller, info: MenuContextInfo) => () => {
    try {
        if (command.type === 'open') shell.subproc.open(command.path, expandArgs(command.args ?? '', info));
        else shell.clipboard.write_text(command.text ?? '');
    } finally {
        menu.close();
    }
};

const itemData = (node: Extract<PlanNode, { kind: 'item' }>, root: shell.menu_controller, info: MenuContextInfo): shell.js_menu_data => {
    const source = node.source;
    const data: shell.js_menu_data = source ? { ...source.data } : { type: 'button' };
    const label = node.label ?? source?.name ?? '';
    if (label.length > 0) data.name = label;
    data.type = 'button';

    if (source) {
        data.wID = source.wID;
        data.name_resid = source.nameResid;
        data.origin_name = source.originName;
        data.hotkey = source.hotkey;
        data.disabled = node.disabled ? true : source.disabled;
    } else {
        data.disabled = node.disabled;
        data.action = node.command ? customAction(node.command, root, info) : () => root.close();
    }

    applyIcon(data, node.icon);
    return data;
};

const groupIcon = (icon: ItemNode['icon']): Partial<shell.js_menu_data> => {
    const svg = resolveIconSvg(icon);
    return svg === null ? {} : { icon_svg: svg };
};

const appendPlan = (menu: shell.menu_controller, nodes: PlanNode[], root: shell.menu_controller, info: MenuContextInfo) => {
    for (const node of nodes) {
        if (node.kind === 'sep') {
            menu.append_item({ type: 'spacer' });
            continue;
        }

        if (node.kind === 'item') {
            menu.append_item(itemData(node, root, info));
            continue;
        }

        if (node.layout === 'row') {
            const group = menu.append_parent_item();
            if (!group) continue;
            for (const child of node.children) {
                if (child.kind === 'item') group.append_child(itemData(child, root, info));
                else if (child.kind === 'sep') group.append_child({ type: 'spacer' });
            }
            continue;
        }

        menu.append_item({
            type: 'button',
            name: node.label,
            ...groupIcon(node.icon),
            submenu: (submenu: shell.menu_controller) => appendPlan(submenu, node.children, root, info)
        });
    }
};

export type ApplyResult = {
    applied: boolean;
    reason: string;
    captured: number;
    planned: number;
};

export const applyProfile = (
    menu: shell.menu_controller,
    profile: Profile,
    info: MenuContextInfo,
    captured?: CapturedItem[]
): ApplyResult => {
    if (!profile.enabled) return { applied: false, reason: 'profile-disabled', captured: 0, planned: 0 };
    if (!matchesProfileContext(profile, info)) return { applied: false, reason: 'context-mismatch', captured: 0, planned: 0 };

    const items = captured ?? captureMenu(menu);
    if (items.length === 0) return { applied: false, reason: 'empty-menu', captured: 0, planned: 0 };

    const plan = planMenu(items, profile);
    menu.clear();
    appendPlan(menu, plan, menu, info);

    return { applied: true, reason: plan.length === 0 ? 'empty-plan' : 'ok', captured: items.length, planned: plan.length };
};
