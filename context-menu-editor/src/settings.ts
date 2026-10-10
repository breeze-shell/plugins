import { GroupNode, IconSpec, ItemNode, ItemRef, MenuKind, Node, Profile, Settings, Snapshot, SnapshotItem, UnmanagedPolicy } from './types';
import { MENU_KINDS } from './types';
import { emptyProfile, newId } from './model';

export const SCHEMA_VERSION = 1;

export const defaultSettings = (): Settings => {
    const profiles = {} as Record<MenuKind, Profile>;
    for (const kind of MENU_KINDS) profiles[kind] = emptyProfile(kind);
    return { version: SCHEMA_VERSION, profiles, snapshots: {}, showMenuEntry: true, logLevel: 'basic' };
};

const normalizeIcon = (raw: unknown): IconSpec => {
    if (!raw || typeof raw !== 'object') return { source: 'original' };
    const icon = raw as { source?: unknown; svg?: unknown };
    if (icon.source === 'none') return { source: 'none' };
    if (icon.source === 'svg' && typeof icon.svg === 'string' && icon.svg.trim().length > 0) {
        return { source: 'svg', svg: icon.svg };
    }
    return { source: 'original' };
};

const normalizeRef = (raw: unknown): ItemRef | null => {
    if (!raw || typeof raw !== 'object') return null;
    const ref = raw as Partial<ItemRef>;
    if (typeof ref.key !== 'string' || ref.key.length === 0) return null;
    return {
        key: ref.key,
        name: typeof ref.name === 'string' ? ref.name : '',
        originName: typeof ref.originName === 'string' ? ref.originName : undefined,
        nameResid: typeof ref.nameResid === 'string' ? ref.nameResid : undefined,
        wID: typeof ref.wID === 'number' ? ref.wID : undefined,
        hotkey: typeof ref.hotkey === 'string' ? ref.hotkey : undefined,
        hasSubmenu: ref.hasSubmenu === true
    };
};

const normalizeCommand = (raw: unknown): ItemNode['command'] => {
    if (!raw || typeof raw !== 'object') return undefined;
    const command = raw as { type?: unknown; path?: unknown; args?: unknown; text?: unknown };
    if (command.type === 'open' && typeof command.path === 'string') {
        return { type: 'open', path: command.path, args: typeof command.args === 'string' ? command.args : '' };
    }
    if (command.type === 'copy' && typeof command.text === 'string') {
        return { type: 'copy', text: command.text };
    }
    return undefined;
};

const normalizeNode = (raw: unknown): Node | null => {
    if (!raw || typeof raw !== 'object') return null;
    const node = raw as Record<string, unknown>;
    const id = typeof node.id === 'string' && node.id.length > 0 ? node.id : newId();

    if (node.kind === 'sep') return { kind: 'sep', id };

    if (node.kind === 'group') {
        const children = normalizeNodes(node.children);
        const label = typeof node.label === 'string' && node.label.trim().length > 0 ? node.label.trim() : '分组';
        const group: GroupNode = {
            kind: 'group',
            id,
            layout: node.layout === 'row' ? 'row' : 'fold',
            label,
            icon: normalizeIcon(node.icon),
            hidden: node.hidden === true,
            children
        };
        return group;
    }

    if (node.kind === 'item') {
        const ref = normalizeRef(node.ref);
        const command = normalizeCommand(node.command);
        if (!ref && !command) return null;
        return {
            kind: 'item',
            id,
            ref,
            command,
            label: typeof node.label === 'string' && node.label.length > 0 ? node.label : null,
            icon: normalizeIcon(node.icon),
            hidden: node.hidden === true,
            disabled: node.disabled === true
        };
    }

    return null;
};

export const normalizeNodes = (raw: unknown): Node[] => {
    if (!Array.isArray(raw)) return [];
    const out: Node[] = [];
    for (const entry of raw) {
        const node = normalizeNode(entry);
        if (node) out.push(node);
    }
    return out;
};

const normalizeSnapshot = (raw: unknown): Snapshot | null => {
    if (!raw || typeof raw !== 'object') return null;
    const snapshot = raw as Partial<Snapshot>;
    if (!Array.isArray(snapshot.items)) return null;
    const items: SnapshotItem[] = [];
    for (const entry of snapshot.items) {
        if (!entry || typeof entry !== 'object') continue;
        const item = entry as Partial<SnapshotItem>;
        if (typeof item.key !== 'string') continue;
        items.push({
            key: item.key,
            name: typeof item.name === 'string' ? item.name : '',
            originName: typeof item.originName === 'string' ? item.originName : undefined,
            nameResid: typeof item.nameResid === 'string' ? item.nameResid : undefined,
            wID: typeof item.wID === 'number' ? item.wID : undefined,
            hotkey: typeof item.hotkey === 'string' ? item.hotkey : undefined,
            disabled: item.disabled === true,
            hasSubmenu: item.hasSubmenu === true,
            separator: item.separator === true,
            iconSvg: typeof item.iconSvg === 'string' ? item.iconSvg : undefined,
            hasIconBitmap: item.hasIconBitmap === true
        });
    }
    return {
        at: Number(snapshot.at) || 0,
        kind: MENU_KINDS.includes(snapshot.kind as MenuKind) ? (snapshot.kind as MenuKind) : 'other',
        windowTitle: String(snapshot.windowTitle ?? ''),
        className: String(snapshot.className ?? ''),
        executable: String(snapshot.executable ?? ''),
        path: String(snapshot.path ?? ''),
        selection: Number(snapshot.selection) || 0,
        items
    };
};

const normalizeProfile = (kind: MenuKind, raw: unknown): Profile => {
    const base = emptyProfile(kind);
    if (!raw || typeof raw !== 'object') return base;
    const input = raw as Partial<Profile>;
    base.enabled = input.enabled === true;
    base.nodes = normalizeNodes(input.nodes);
    base.unmanaged = (['keep-end', 'keep-original', 'hide'] as UnmanagedPolicy[]).includes(input.unmanaged as UnmanagedPolicy)
        ? (input.unmanaged as UnmanagedPolicy)
        : 'keep-end';
    base.processFilter = typeof input.processFilter === 'string' ? input.processFilter : '';
    base.titleFilter = typeof input.titleFilter === 'string' ? input.titleFilter : '';
    base.updatedAt = Number(input.updatedAt) || 0;
    return base;
};

export const normalizeSettings = (raw: unknown): Settings => {
    const base = defaultSettings();
    if (!raw || typeof raw !== 'object') return base;
    const input = raw as Partial<Settings>;

    for (const kind of MENU_KINDS) {
        base.profiles[kind] = normalizeProfile(kind, input.profiles?.[kind]);
    }

    if (input.snapshots && typeof input.snapshots === 'object') {
        for (const kind of MENU_KINDS) {
            const snapshot = normalizeSnapshot(input.snapshots[kind]);
            if (snapshot) base.snapshots[kind] = snapshot;
        }
    }

    base.showMenuEntry = input.showMenuEntry !== false;
    base.logLevel = input.logLevel === 'off' || input.logLevel === 'verbose' ? input.logLevel : 'basic';
    return base;
};
