export const SEP = '\\';

export type RenameItem = {
    path: string;
    dir: string;
    name: string;
    base: string;
    ext: string;
    isDir: boolean;
    size: number;
    mtime: Date | null;
    pickedIndex: number;
};

export const splitPath = (path: string): { dir: string; name: string } => {
    const normalized = path.replace(/\//g, SEP);
    const cut = normalized.lastIndexOf(SEP);
    return cut < 0
        ? { dir: '', name: normalized }
        : { dir: normalized.slice(0, cut), name: normalized.slice(cut + 1) };
};

export const joinPath = (dir: string, name: string) => (dir ? dir + SEP + name : name);

const DOTFILES = new Set(['.', '..']);

export const splitName = (name: string, isDir: boolean): { base: string; ext: string } => {
    if (isDir || DOTFILES.has(name)) {
        return { base: name, ext: '' };
    }
    const dot = name.lastIndexOf('.');
    return dot <= 0
        ? { base: name, ext: '' }
        : { base: name.slice(0, dot), ext: name.slice(dot) };
};

export const naturalCompare = (a: string, b: string) => {
    const ax = a.toLowerCase();
    const bx = b.toLowerCase();
    let i = 0;
    let j = 0;
    while (i < ax.length && j < bx.length) {
        const ca = ax[i];
        const cb = bx[j];
        const da = ca >= '0' && ca <= '9';
        const db = cb >= '0' && cb <= '9';
        if (da && db) {
            let na = '';
            let nb = '';
            while (i < ax.length && ax[i] >= '0' && ax[i] <= '9') na += ax[i++];
            while (j < bx.length && bx[j] >= '0' && bx[j] <= '9') nb += bx[j++];
            const diff = Number(na) - Number(nb);
            if (diff !== 0) return diff < 0 ? -1 : 1;
            continue;
        }
        if (ca !== cb) return ca < cb ? -1 : 1;
        i++;
        j++;
    }
    return ax.length - i - (bx.length - j);
};

export const compareByName = (a: RenameItem, b: RenameItem) => naturalCompare(a.name, b.name);

// 文件系统里不允许的字符, 以及 Windows 保留设备名。
const ILLEGAL = /[<>:"/\\|?*\u0000-\u001F]/g;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

export const findIllegalChars = (name: string) => {
    const found = name.match(ILLEGAL);
    return found ? Array.from(new Set(found)) : [];
};

export type ValidationIssue = 'empty' | 'illegal' | 'reserved' | 'trailing' | 'toolong';

export const validateName = (name: string, dir = '', isDir = false): ValidationIssue | null => {
    if (!name || !name.trim()) return 'empty';
    if (name === '.' || name === '..') return 'illegal';
    const illegal = findIllegalChars(name);
    if (illegal.length > 0) return 'illegal';
    if (RESERVED.test(name.trimEnd())) return 'reserved';
    if (/[ .]$/.test(name)) return 'trailing';
    const ext = isDir ? '' : splitName(name, false).ext;
    if (ext.length > 32) return 'toolong';
    if (dir.length + name.length + 1 > 250) return 'toolong';
    return null;
};

export const padNumber = (value: number, digits: number) => {
    const text = String(Math.max(0, Math.trunc(value)));
    return digits > text.length ? '0'.repeat(digits - text.length) + text : text;
};

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

export const toLetters = (value: number, upper = false, digits = 0) => {
    let n = Math.max(1, Math.trunc(value));
    let out = '';
    while (n > 0) {
        const rem = (n - 1) % 26;
        out = LETTERS[rem] + out;
        n = Math.floor((n - 1) / 26);
    }
    if (digits > out.length) out = LETTERS[0].repeat(digits - out.length) + out;
    return upper ? out.toUpperCase() : out;
};

export type DiffPart = { text: string; kind: 'same' | 'del' | 'add' };

export const diffNames = (oldName: string, newName: string): DiffPart[] => {
    if (oldName === newName) return [{ text: oldName, kind: 'same' }];

    let head = 0;
    const maxHead = Math.min(oldName.length, newName.length);
    while (head < maxHead && oldName[head] === newName[head]) head++;

    let tail = 0;
    const maxTail = Math.min(oldName.length - head, newName.length - head);
    while (tail < maxTail && oldName[oldName.length - 1 - tail] === newName[newName.length - 1 - tail]) tail++;

    const oldMid = oldName.slice(head, oldName.length - tail);
    const newMid = newName.slice(head, newName.length - tail);

    const parts: DiffPart[] = [];
    const pushSame = (text: string) => {
        if (!text) return;
        const last = parts[parts.length - 1];
        if (last && last.kind === 'same') last.text += text;
        else parts.push({ text, kind: 'same' });
    };

    pushSame(oldName.slice(0, head));
    if (oldMid) parts.push({ text: oldMid, kind: 'del' });
    if (newMid) parts.push({ text: newMid, kind: 'add' });
    pushSame(tail > 0 ? oldName.slice(oldName.length - tail) : '');
    return parts;
};

export const formatSize = (bytes: number) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }
    return `${unit === 0 ? value : value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
};

const pad2 = (value: number) => (value < 10 ? '0' + value : String(value));

export const formatDate = (date: Date, pattern: string) => {
    const map: Record<string, string> = {
        YYYY: String(date.getFullYear()),
        YY: String(date.getFullYear()).slice(2),
        MM: pad2(date.getMonth() + 1),
        M: String(date.getMonth() + 1),
        DD: pad2(date.getDate()),
        D: String(date.getDate()),
        HH: pad2(date.getHours()),
        H: String(date.getHours()),
        mm: pad2(date.getMinutes()),
        m: String(date.getMinutes()),
        ss: pad2(date.getSeconds()),
        s: String(date.getSeconds())
    };
    return pattern.replace(/YYYY|YY|MM|DD|HH|mm|ss|M|D|H|m|s/g, token => map[token]);
};

export const parseDateText = (text: string, fallback: Date) => {
    const matched = text
        .trim()
        .match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
    if (!matched) return new Date(fallback.getTime());
    const date = new Date(
        Number(matched[1]),
        Number(matched[2]) - 1,
        Number(matched[3]),
        Number(matched[4] ?? 0),
        Number(matched[5] ?? 0),
        Number(matched[6] ?? 0)
    );
    return Number.isNaN(date.getTime()) ? new Date(fallback.getTime()) : date;
};
