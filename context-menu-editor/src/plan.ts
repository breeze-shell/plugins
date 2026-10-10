import * as shell from 'mshell';
import { ItemNode, ItemRef, MenuKind, Node, Profile, Snapshot, SnapshotItem } from './types';
import { itemNode } from './model';

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
    selection: number;
    title: string;
    className: string;
    executable: string;
};

const baseKeyOf = (nameResid?: string, originName?: string, name?: string): string => {
    if (nameResid) return `r:${nameResid}`;
    if (originName) return `o:${originName}`;
    return `n:${name ?? ''}`;
};

export const classifyMenu = (context: shell.js_menu_context): MenuContextInfo => {
    const windowInfo = context.window_info;
    const info = {
        path: '',
        selection: 0,
        title: windowInfo?.title ?? '',
        className: windowInfo?.class_name ?? '',
        executable: windowInfo?.executable_path ?? ''
    };

    const folderView = context.folder_view;
    if (folderView) {
        const selection = folderView.selected_files?.length ?? 0;
        return { ...info, kind: selection > 0 ? 'files' : 'folder', path: folderView.current_path ?? '', selection };
    }

    if (/^(Progman|WorkerW|SHELLDLL_DefView)$/i.test(info.className)) return { ...info, kind: 'desktop' };
    if (/^Shell_(Secondary)?TrayWnd$/i.test(info.className)) return { ...info, kind: 'taskbar' };
    return { ...info, kind: 'other' };
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

export const toRef = (item: CapturedItem): ItemRef => ({
    key: item.key,
    name: item.name,
    originName: item.originName,
    nameResid: item.nameResid,
    wID: item.wID,
    hotkey: item.hotkey,
    hasSubmenu: item.hasSubmenu
});

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

const planNodeOf = (node: Node, sources: Map<string, CapturedItem>, used: Set<string>): PlanNode | null => {
    if (node.kind !== 'sep' && node.hidden) {
        // 隐藏的节点整个丢掉, 同时把它吃掉的原生项标记掉, 免得被当成"未列项"捡回来
        markConsumed(node, sources, used);
        return null;
    }

    if (node.kind === 'sep') return { kind: 'sep' };

    if (node.kind === 'group') {
        const children: PlanNode[] = [];
        for (const child of node.children) {
            const planned = planNodeOf(child, sources, used);
            if (planned) children.push(planned);
        }
        return children.length === 0 ? null : { kind: 'group', layout: node.layout, label: node.label, icon: node.icon, children };
    }

    const source = node.ref ? sources.get(node.ref.key) ?? null : null;
    if (!source && !node.command) return null;
    if (source) used.add(source.key);

    return { kind: 'item', source, label: node.label, icon: node.icon, disabled: node.disabled, command: node.command };
};

const passthrough = (item: CapturedItem): PlanNode => ({
    kind: 'item',
    source: item,
    label: null,
    icon: { source: 'original' },
    disabled: false
});

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

export const tidyPlan = (plan: PlanNode[]): PlanNode[] => {
    const out: PlanNode[] = [];
    for (const node of plan) {
        if (node.kind === 'sep' && (out.length === 0 || out[out.length - 1].kind === 'sep')) continue;
        out.push(node);
    }
    while (out.length > 0 && out[out.length - 1].kind === 'sep') out.pop();
    return out;
};

export const planMenu = (captured: CapturedItem[], profile: Profile): PlanNode[] => {
    const sources = new Map<string, CapturedItem>();
    for (const item of captured) if (!item.separator) sources.set(item.key, item);

    const used = new Set<string>();
    const plan: PlanNode[] = [];
    for (const node of profile.nodes) {
        const planned = planNodeOf(node, sources, used);
        if (planned) plan.push(planned);
    }

    if (profile.unmanaged === 'hide') return tidyPlan(plan);

    const leftovers = captured.filter(item => !item.separator && !used.has(item.key));
    if (profile.unmanaged === 'keep-end') {
        for (const item of leftovers) plan.push(passthrough(item));
        return tidyPlan(plan);
    }

    for (const item of leftovers) {
        let position = plan.length;
        for (let i = 0; i < plan.length; i++) {
            const index = firstSourceIndex(plan[i]);
            if (index !== null && index > item.index) {
                position = i;
                break;
            }
        }
        plan.splice(position, 0, passthrough(item));
    }

    return tidyPlan(plan);
};

const resolveIconSvg = (icon: ItemNode['icon']): string | null => {
    if (icon.source !== 'svg') return null;
    const color = shell.breeze.is_light_theme() ? '#1a1a1a' : '#f2f2f2';
    return icon.svg.replace(/currentColor/g, color);
};

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

const customAction = (command: NonNullable<ItemNode['command']>, menu: shell.menu_controller) => () => {
    try {
        if (command.type === 'open') shell.subproc.open(command.path, command.args ?? '');
        else shell.clipboard.write_text(command.text ?? '');
    } finally {
        menu.close();
    }
};

const itemData = (node: Extract<PlanNode, { kind: 'item' }>, menu: shell.menu_controller): shell.js_menu_data => {
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
        data.action = node.command ? customAction(node.command, menu) : () => menu.close();
    }

    applyIcon(data, node.icon);
    return data;
};

const groupIcon = (icon: ItemNode['icon']): Partial<shell.js_menu_data> => {
    const svg = resolveIconSvg(icon);
    return svg === null ? {} : { icon_svg: svg };
};

const appendPlan = (menu: shell.menu_controller, nodes: PlanNode[]) => {
    for (const node of nodes) {
        if (node.kind === 'sep') {
            menu.append_item({ type: 'spacer' });
            continue;
        }

        if (node.kind === 'item') {
            menu.append_item(itemData(node, menu));
            continue;
        }

        if (node.layout === 'row') {
            const group = menu.append_parent_item();
            if (!group) continue;
            for (const child of node.children) {
                if (child.kind === 'item') group.append_child(itemData(child, menu));
                else if (child.kind === 'sep') group.append_child({ type: 'spacer' });
            }
            continue;
        }

        menu.append_item({
            type: 'button',
            name: node.label,
            ...groupIcon(node.icon),
            submenu: (submenu: shell.menu_controller) => appendPlan(submenu, node.children)
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
    if (plan.length === 0) return { applied: false, reason: 'empty-plan', captured: items.length, planned: 0 };

    menu.clear();
    appendPlan(menu, plan);

    return { applied: true, reason: 'ok', captured: items.length, planned: plan.length };
};
