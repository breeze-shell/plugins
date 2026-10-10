export const KEY = {
    escape: 256,
    enter: 257,
    delete: 261,
    down: 264,
    up: 265,
    y: 89,
    z: 90,
    d: 68
};

export type ShortcutMods = { shift: boolean; ctrl: boolean; alt: boolean; super: boolean };

export type ShortcutState = {
    hasSelection: boolean;
    editing: boolean;
    canUndo: boolean;
    canRedo: boolean;
    canRemove: boolean;
};

export type ShortcutAction =
    | 'undo'
    | 'redo'
    | 'duplicate'
    | 'remove'
    | 'selectPrev'
    | 'selectNext'
    | 'moveUp'
    | 'moveDown'
    | 'rename'
    | 'deselect';

// Delete 与方向键只认带修饰键的组合; 输入框聚焦时调用方不该再把按键交给这里
export const shortcutFor = (key: number, mods: ShortcutMods, state: ShortcutState): ShortcutAction | null => {
    if (state.editing) return key === KEY.escape ? 'deselect' : null;

    const ctrl = mods.ctrl || mods.super;
    if (ctrl && key === KEY.z) return mods.shift ? (state.canRedo ? 'redo' : null) : state.canUndo ? 'undo' : null;
    if (ctrl && key === KEY.y) return state.canRedo ? 'redo' : null;
    if (ctrl && key === KEY.d) return state.hasSelection ? 'duplicate' : null;
    if (ctrl && key === KEY.delete) return state.canRemove ? 'remove' : null;
    if (mods.alt && key === KEY.up) return 'selectPrev';
    if (mods.alt && key === KEY.down) return 'selectNext';
    if (ctrl && key === KEY.up) return state.canRemove ? 'moveUp' : null;
    if (ctrl && key === KEY.down) return state.canRemove ? 'moveDown' : null;
    if (key === KEY.enter) return state.hasSelection ? 'rename' : null;
    if (key === KEY.escape) return state.hasSelection ? 'deselect' : null;
    return null;
};

export const stepIndex = (at: number, delta: number, length: number): number => {
    if (at === -1) return delta > 0 ? 0 : length - 1;
    return Math.max(0, Math.min(at + delta, length - 1));
};
