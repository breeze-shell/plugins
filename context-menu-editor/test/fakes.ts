// 内存版菜单假件: 复现 plan.ts 依赖的那部分 breeze 菜单语义 (data() 返回副本, clear 后旧控制器失效)。
import type { js_menu_data, menu_controller, menu_item_controller, menu_item_parent_item_controller } from 'mshell';

export type FakeItemSpec = {
    name?: string;
    type?: 'button' | 'spacer';
    iconSvg?: string;
    iconBitmap?: number;
    disabled?: boolean;
    submenu?: boolean;
    wID?: number;
    nameResid?: string;
    originName?: string;
    hotkey?: string;
};

export type FakeEntry = {
    name: string | null;
    type: string;
    renamed: boolean;
    iconSvg: string | null;
    iconBitmap: number | null;
    disabled: boolean;
    separator: boolean;
    hasAction: boolean;
    hasSubmenu: boolean;
    row?: boolean;
    wID?: number;
    nameResid?: string;
    originName?: string;
    hotkey?: string;
    children?: FakeEntry[];
};

// 原生项的动作按调用顺序记录, 用来证明重建后仍然是原来那个回调。
export const activated: string[] = [];
export const resetActivated = () => {
    activated.length = 0;
};

type FakeData = js_menu_data & { hotkey?: string };

type ItemRecord = {
    kind: 'item' | 'parent';
    data: FakeData;
    baseName: string | undefined;
    removed: boolean;
    children: ItemRecord[];
    ctrl: menu_item_controller | null;
};

type Container = { entries: ItemRecord[] };

const copyData = (data: FakeData): FakeData => ({ ...data });

const markRemoved = (record: ItemRecord) => {
    record.removed = true;
    for (const child of record.children) markRemoved(child);
};

// 列表宿主可以是整张菜单, 也可以是 row 组的父项。
const pushRecord = (owner: Container, kind: 'item' | 'parent', data: FakeData, index: number): menu_item_controller => {
    const record: ItemRecord = {
        kind,
        data: copyData(data),
        baseName: typeof data.name === 'string' ? data.name : undefined,
        removed: false,
        children: [],
        ctrl: null
    };
    const ctrl = new FakeController(owner, record);
    // row 组的子项就存在它自己的 entries 里, 让 record.children 指向同一个数组。
    record.children = ctrl.entries;
    record.ctrl = ctrl as unknown as menu_item_controller;
    owner.entries.splice(Math.max(0, Math.min(index, owner.entries.length)), 0, record);
    return record.ctrl;
};

export class FakeController implements Container {
    entries: ItemRecord[] = [];

    constructor(private readonly owner: Container, private readonly record: ItemRecord) {}

    get position(): number {
        return this.owner.entries.filter(entry => !entry.removed).indexOf(this.record);
    }

    get visible(): boolean {
        return !this.record.removed;
    }

    valid(): boolean {
        return !this.record.removed;
    }

    data(): js_menu_data {
        return copyData(this.record.data);
    }

    update_data(data: js_menu_data): void {
        this.record.data = copyData(data as FakeData);
    }

    remove(): void {
        markRemoved(this.record);
    }

    children(): menu_item_controller[] {
        return this.entries.filter(entry => !entry.removed).map(entry => entry.ctrl as menu_item_controller);
    }

    append_child(data: js_menu_data): menu_item_controller {
        return pushRecord(this, 'item', data as FakeData, this.entries.length);
    }

    prepend_child(data: js_menu_data): menu_item_controller {
        return pushRecord(this, 'item', data as FakeData, 0);
    }

    append_child_after(data: js_menu_data, after_index: number): menu_item_controller {
        return pushRecord(this, 'item', data as FakeData, after_index + 1);
    }
}

export class FakeMenu implements Container {
    entries: ItemRecord[] = [];
    closeCount = 0;

    get items(): menu_item_controller[] {
        return this.entries.filter(entry => !entry.removed).map(entry => entry.ctrl as menu_item_controller);
    }

    valid(): boolean {
        return true;
    }

    close(): void {
        this.closeCount += 1;
    }

    clear(): void {
        for (const entry of this.entries) markRemoved(entry);
        this.entries = [];
    }

    append_item(data: js_menu_data): menu_item_controller {
        return pushRecord(this, 'item', data as FakeData, this.entries.length);
    }

    append_item_after(data: js_menu_data, after_index: number): menu_item_controller {
        return pushRecord(this, 'item', data as FakeData, after_index + 1);
    }

    append_parent_item(): menu_item_parent_item_controller {
        return pushRecord(this, 'parent', { type: 'button' }, this.entries.length) as unknown as menu_item_parent_item_controller;
    }

    append_parent_item_after(after_index: number): menu_item_parent_item_controller {
        return pushRecord(this, 'parent', { type: 'button' }, after_index + 1) as unknown as menu_item_parent_item_controller;
    }
}

const nativeData = (spec: FakeItemSpec): FakeData => {
    const data: FakeData = { type: spec.type ?? 'button' };
    if (spec.name !== undefined) data.name = spec.name;
    if (spec.iconSvg !== undefined) data.icon_svg = spec.iconSvg;
    if (spec.iconBitmap !== undefined) data.icon_bitmap = spec.iconBitmap;
    if (spec.disabled !== undefined) data.disabled = spec.disabled;
    if (spec.wID !== undefined) data.wID = spec.wID;
    if (spec.nameResid !== undefined) data.name_resid = spec.nameResid;
    if (spec.originName !== undefined) data.origin_name = spec.originName;
    if (spec.hotkey !== undefined) data.hotkey = spec.hotkey;
    if (data.type === 'spacer') return data;

    const tag = `activated:${spec.wID !== undefined ? spec.wID : spec.name ?? ''}`;
    data.action = () => {
        activated.push(tag);
    };
    if (spec.submenu) {
        data.submenu = (submenu: menu_controller) => {
            submenu.append_item({
                type: 'button',
                name: `${spec.name ?? ''} > 打开`,
                action: () => {
                    activated.push(`${tag}:submenu`);
                }
            });
        };
    }
    return data;
};

export const createFakeMenu = (items: FakeItemSpec[] = []): FakeMenu => {
    const menu = new FakeMenu();
    for (const spec of items) menu.append_item(nativeData(spec));
    return menu;
};

export const asMenu = (menu: FakeMenu): menu_controller => menu as unknown as menu_controller;

export const asParent = (ctrl: menu_item_controller): menu_item_parent_item_controller => ctrl as unknown as menu_item_parent_item_controller;

const describeRecord = (record: ItemRecord): FakeEntry => {
    const data = record.data;
    const entry: FakeEntry = {
        name: typeof data.name === 'string' ? data.name : null,
        type: record.kind === 'parent' ? 'group' : data.type ?? 'button',
        renamed: typeof data.name === 'string' && data.name !== record.baseName,
        iconSvg: typeof data.icon_svg === 'string' ? data.icon_svg : null,
        iconBitmap: typeof data.icon_bitmap === 'number' ? data.icon_bitmap : null,
        disabled: data.disabled === true,
        separator: data.type === 'spacer',
        hasAction: typeof data.action === 'function',
        hasSubmenu: typeof data.submenu === 'function',
        wID: data.wID,
        nameResid: data.name_resid,
        originName: data.origin_name,
        hotkey: data.hotkey
    };
    if (record.kind === 'parent') {
        entry.row = true;
        entry.children = record.children.filter(child => !child.removed).map(describeRecord);
    }
    return entry;
};

// row 组表现为 row: true + children, 折叠组的 children 要自己开子菜单看。
export const describeMenu = (menu: FakeMenu): FakeEntry[] => menu.entries.filter(entry => !entry.removed).map(describeRecord);

export const namesOf = (entries: FakeEntry[]): string[] => entries.map(entry => entry.name ?? '');

export const sepIndices = (entries: FakeEntry[]): number[] =>
    entries.flatMap((entry, index) => (entry.separator ? [index] : []));

export const findItem = (list: menu_item_controller[], name: string): menu_item_controller | undefined =>
    list.find(ctrl => ctrl.data()?.name === name);

export const parentControllers = (menu: FakeMenu): menu_item_parent_item_controller[] =>
    menu.entries.filter(entry => !entry.removed && entry.kind === 'parent').map(entry => entry.ctrl as menu_item_parent_item_controller);

export const openSubmenu = (ctrl: menu_item_controller): FakeMenu => {
    const submenu = new FakeMenu();
    const handler = ctrl.data()?.submenu;
    if (typeof handler === 'function') handler(asMenu(submenu));
    return submenu;
};

export const runAction = (ctrl: menu_item_controller): void => {
    const action = ctrl.data()?.action as unknown as (() => void) | undefined;
    if (typeof action === 'function') action();
};
