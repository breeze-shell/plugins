export type MenuKind = 'files' | 'folder' | 'desktop' | 'taskbar' | 'other';

export const MENU_KINDS: MenuKind[] = ['files', 'folder', 'desktop', 'taskbar', 'other'];

export type IconSpec = { source: 'original' } | { source: 'none' } | { source: 'svg'; svg: string };

export type ItemRef = {
    key: string;
    name: string;
    originName?: string;
    nameResid?: string;
    wID?: number;
    hotkey?: string;
    hasSubmenu: boolean;
};

export type CustomCommand =
    | { type: 'open'; path: string; args: string }
    | { type: 'copy'; text: string };

export type ItemNode = {
    kind: 'item';
    id: string;
    ref: ItemRef | null;
    command?: CustomCommand;
    label: string | null;
    icon: IconSpec;
    hidden: boolean;
    disabled: boolean;
};

export type GroupNode = {
    kind: 'group';
    id: string;
    layout: 'fold' | 'row';
    label: string;
    icon: IconSpec;
    hidden: boolean;
    children: Node[];
};

export type SepNode = {
    kind: 'sep';
    id: string;
};

export type Node = ItemNode | GroupNode | SepNode;

export type UnmanagedPolicy = 'keep-end' | 'keep-original' | 'hide';

export type Profile = {
    kind: MenuKind;
    enabled: boolean;
    nodes: Node[];
    unmanaged: UnmanagedPolicy;
    processFilter: string;
    titleFilter: string;
    updatedAt: number;
};

export type SnapshotItem = {
    key: string;
    name: string;
    originName?: string;
    nameResid?: string;
    wID?: number;
    hotkey?: string;
    disabled: boolean;
    hasSubmenu: boolean;
    separator: boolean;
    iconSvg?: string;
    hasIconBitmap: boolean;
};

export type Snapshot = {
    at: number;
    kind: MenuKind;
    windowTitle: string;
    className: string;
    executable: string;
    path: string;
    selection: number;
    items: SnapshotItem[];
};

export type Settings = {
    profiles: Record<MenuKind, Profile>;
    snapshots: Partial<Record<MenuKind, Snapshot>>;
    showMenuEntry: boolean;
    logLevel: 'off' | 'basic' | 'verbose';
};
