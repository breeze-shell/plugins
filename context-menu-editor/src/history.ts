import { MenuKind, Profile } from './types';

export type HistoryEntry = { kind: MenuKind; profile: Profile };

export type History = { past: HistoryEntry[]; future: HistoryEntry[]; mergeKey: string | null };

export const HISTORY_LIMIT = 40;

export const emptyHistory = (): History => ({ past: [], future: [], mergeKey: null });

export const recordHistory = (history: History, entry: HistoryEntry, mergeKey: string | null = null): History => {
    if (mergeKey !== null && mergeKey === history.mergeKey) return history;
    return { past: [...history.past.slice(-(HISTORY_LIMIT - 1)), entry], future: [], mergeKey };
};

const travel = (from: HistoryEntry[], to: HistoryEntry[], profiles: Record<MenuKind, Profile>) => {
    const target = from[from.length - 1];
    if (!target) return null;
    return {
        from: from.slice(0, -1),
        to: [...to.slice(-(HISTORY_LIMIT - 1)), { kind: target.kind, profile: profiles[target.kind] }],
        restore: target
    };
};

export const undoHistory = (history: History, profiles: Record<MenuKind, Profile>): { history: History; restore: HistoryEntry } | null => {
    const moved = travel(history.past, history.future, profiles);
    return moved && { history: { past: moved.from, future: moved.to, mergeKey: null }, restore: moved.restore };
};

export const redoHistory = (history: History, profiles: Record<MenuKind, Profile>): { history: History; restore: HistoryEntry } | null => {
    const moved = travel(history.future, history.past, profiles);
    return moved && { history: { past: moved.to, future: moved.from, mergeKey: null }, restore: moved.restore };
};
